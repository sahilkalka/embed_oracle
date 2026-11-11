#!/usr/bin/env bash
# ==============================================================================
# scripts/mail-audit.sh — READ-ONLY health & security audit of the mail stack
# Run on the Oracle server:  sudo bash scripts/mail-audit.sh | tee /tmp/mail-audit.txt
# Changes nothing. Secrets are masked in the output so it is safe to share.
# ==============================================================================
set -uo pipefail

MAIL_DIR="${MAIL_DIR:-/embed_mail}"
APP_DIR="${APP_DIR:-/var/www/embeddedindia}"
DOMAIN="${DOMAIN:-embeddedindia.in}"
MAIL_HOST="${MAIL_HOST:-mail.embeddedindia.in}"
PASS=0; WARN=0; FAIL=0

ok()   { echo "  [PASS] $*"; PASS=$((PASS+1)); }
warn() { echo "  [WARN] $*"; WARN=$((WARN+1)); }
bad()  { echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }
hdr()  { echo; echo "== $* =="; }
dc()   { (cd "$MAIL_DIR" && docker compose "$@"); }
mask() { sed -E 's/(PASS|KEY|SECRET|TOKEN)([A-Z_]*)=.*/\1\2=***masked***/I'; }

hdr "System"
echo "  host: $(hostname)  kernel: $(uname -r)  arch: $(uname -m)"
echo "  uptime: $(uptime -p)"
free -m | awk 'NR==2{printf "  memory: %s MB used / %s MB total (avail %s MB)\n",$3,$2,$7}'
SWAP=$(free -m | awk '/Swap/{print $2}')
[ "${SWAP:-0}" -gt 0 ] && ok "swap configured (${SWAP} MB)" || warn "no swap (ClamAV/Solr can OOM on small VMs)"
df -h / "$MAIL_DIR" 2>/dev/null | awk 'NR>1{print "  disk "$6": "$5" used ("$4" free)"}' | sort -u
ROOT_USE=$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "${ROOT_USE:-0}" -lt 85 ] && ok "root disk below 85%" || bad "root disk ${ROOT_USE}% full"

hdr "Mail stack (mailcow)"
if [ -f "$MAIL_DIR/mailcow.conf" ]; then
  ok "mailcow found at $MAIL_DIR"
  echo "  version: $(cd "$MAIL_DIR" && git describe --tags 2>/dev/null || git log -1 --format='%h %cd' --date=short 2>/dev/null)"
  (cd "$MAIL_DIR" && git fetch -q --tags origin 2>/dev/null && echo "  latest upstream tag: $(git describe --tags "$(git rev-list --tags --max-count=1)" 2>/dev/null)")
  echo "  config (secrets masked):"
  grep -E '^(MAILCOW_HOSTNAME|HTTP_PORT|HTTP_BIND|HTTPS_PORT|HTTPS_BIND|SKIP_LETS_ENCRYPT|SKIP_SOGO|SKIP_CLAMD|SKIP_SOLR|SKIP_FTS|API_ALLOW_FROM|API_KEY|API_KEY_READ_ONLY|TRUSTED_PROXIES|ADDITIONAL_SAN|WATCHDOG_NOTIFY_EMAIL|MAILDIR_GC_TIME)=' "$MAIL_DIR/mailcow.conf" | mask | sed 's/^/    /'
  grep -qE '^API_KEY=.+' "$MAIL_DIR/mailcow.conf" && ok "API_KEY set" || warn "API_KEY empty (needed for website mail admin)"
  grep -q 'EmbedOracleMailAPI2026' "$MAIL_DIR/mailcow.conf" && bad "API_KEY is still the leaked value" || ok "API_KEY is not the leaked value"
else
  bad "mailcow.conf not found in $MAIL_DIR"
fi

echo "  containers:"
dc ps --format '{{.Service}}\t{{.State}}\t{{.Status}}' 2>/dev/null | sed 's/^/    /'
NOT_UP=$(dc ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2!="running"{print $1}')
[ -z "$NOT_UP" ] && ok "all containers running" || bad "not running: $NOT_UP"
echo "  container memory:"
docker stats --no-stream --format '    {{.Name}}\t{{.MemUsage}}' 2>/dev/null | grep mailcow | sort -k2 -h | tail -8

hdr "Listening ports (host)"
ss -ltnp 2>/dev/null | awk 'NR>1{print $4}' | grep -E ':(25|80|110|143|443|465|587|993|995|4190|3000|8088|8443)$' | sort -u | sed 's/^/  /'
for p in 25 465 587 993 995 4190; do
  ss -ltn | awk '{print $4}' | grep -qE "(^|:)${p}$" && ok "port $p listening" || bad "port $p NOT listening"
done
for p in 110 143; do
  ss -ltn | awk '{print $4}' | grep -qE "^(0\.0\.0\.0|\[::\]|\*):${p}$" && warn "plaintext port $p exposed on all interfaces" || true
done
echo "  host firewall (iptables INPUT accept rules for mail ports):"
iptables -S INPUT 2>/dev/null | grep -E 'dport (25|465|587|993|995|4190|110|143)' | sed 's/^/    /'

hdr "TLS certificates"
cert_check() { # host port [starttls-proto]
  local out
  if [ -n "${3:-}" ]; then out=$(echo QUIT | timeout 10 openssl s_client -starttls "$3" -connect "127.0.0.1:$2" -servername "$1" 2>/dev/null)
  else out=$(echo | timeout 10 openssl s_client -connect "127.0.0.1:$2" -servername "$1" 2>/dev/null); fi
  local info; info=$(echo "$out" | openssl x509 -noout -subject -issuer -enddate 2>/dev/null | tr '\n' ' ')
  if [ -z "$info" ]; then bad "port $2: no certificate"; return; fi
  echo "    $2: $info"
  if echo "$info" | grep -q "issuer=.*Let's Encrypt\|issuer=.*R1[0-9]\|issuer=.*E[0-9]"; then ok "port $2 has a publicly trusted certificate"
  else bad "port $2 certificate is NOT publicly trusted (self-signed) — mail apps will show warnings"; fi
}
cert_check "$MAIL_HOST" 993
cert_check "$MAIL_HOST" 465
cert_check "$MAIL_HOST" 587 smtp
cert_check "$MAIL_HOST" 443
echo "  certbot certificates:"
certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' | sed 's/^/    /'
ls /etc/letsencrypt/renewal-hooks/deploy/ 2>/dev/null | sed 's/^/    deploy hook: /'
echo "  mailcow internal cert: $(openssl x509 -in "$MAIL_DIR/data/assets/ssl/cert.pem" -noout -issuer -enddate 2>/dev/null | tr '\n' ' ')"

hdr "Outbound delivery"
RELAY=$(dc exec -T postfix-mailcow postconf -h relayhost 2>/dev/null | tr -d '\r')
SENDER_RELAY=$(dc exec -T postfix-mailcow postconf -h sender_dependent_relayhost_maps 2>/dev/null | tr -d '\r')
echo "  relayhost: '${RELAY:-<none>}'  sender_dependent_relayhost_maps: '${SENDER_RELAY:-<none>}'"
echo "  mailcow relayhosts (DB):"
if [ -f "$MAIL_DIR/mailcow.conf" ]; then
  # shellcheck disable=SC1090
  source "$MAIL_DIR/mailcow.conf"
  dc exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "SELECT id, hostname, username, active FROM relayhosts;" 2>/dev/null | sed 's/^/    /'
  dc exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "SELECT 'domain', domain, relayhost FROM domain;" 2>/dev/null | sed 's/^/    /'
fi
timeout 8 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' 2>/dev/null && ok "outbound port 25 open (direct send possible)" || warn "outbound port 25 blocked (relay required)"
QUEUE=$(dc exec -T postfix-mailcow postqueue -p 2>/dev/null | tail -1)
echo "  queue: ${QUEUE}"
echo "$QUEUE" | grep -q "empty" && ok "mail queue empty" || warn "mail queue not empty — see 'postqueue -p'"
echo "  last 15 delivery results:"
dc logs --no-color --since 72h postfix-mailcow 2>/dev/null | grep -E 'status=(sent|deferred|bounced)' | tail -15 | sed -E 's/.*(to=<[^>]*>).*(relay=[^,]*).*(status=[a-z]+[^)]*\)?).*/    \1 \2 \3/'
DEFERRED=$(dc logs --no-color --since 72h postfix-mailcow 2>/dev/null | grep -c 'status=deferred')
BOUNCED=$(dc logs --no-color --since 72h postfix-mailcow 2>/dev/null | grep -c 'status=bounced')
[ "$DEFERRED$BOUNCED" = "00" ] && ok "no deferred/bounced mail in 72h" || warn "72h: deferred=$DEFERRED bounced=$BOUNCED"
echo "  SASL relay creds file: $(stat -c '%a %U' "$MAIL_DIR/data/conf/postfix/sasl_passwd" 2>/dev/null || echo 'not present')"

hdr "Inbound"
echo "  last 10 inbound deliveries (dovecot lmtp):"
dc logs --no-color --since 72h dovecot-mailcow 2>/dev/null | grep -E 'lmtp.*saved mail' | tail -10 | sed -E 's/^.*\| //; s/^/    /' | cut -c1-200
echo "  recent auth failures (72h): $(dc logs --no-color --since 72h dovecot-mailcow postfix-mailcow 2>/dev/null | grep -ciE 'auth failed|authentication failed|SASL .* failed')"

hdr "DNS (public, via 1.1.1.1)"
q() { dig +short @1.1.1.1 "$@" 2>/dev/null; }
MX=$(q MX "$DOMAIN"); echo "  MX: $(echo "$MX" | tr '\n' ' ')"
echo "$MX" | grep -qi "$MAIL_HOST" && ok "MX includes $MAIL_HOST" || bad "MX does not point to $MAIL_HOST"
echo "$MX" | grep -qvi "$MAIL_HOST" && warn "MX has other hosts (mail may land elsewhere): $(echo "$MX" | grep -vi "$MAIL_HOST" | tr '\n' ' ')"
A=$(q A "$MAIL_HOST"); MYIP=$(curl -s -4 -m 8 https://ifconfig.me || true)
echo "  $MAIL_HOST A: $A   server public IP: ${MYIP:-unknown}"
[ -n "$MYIP" ] && [ "$A" = "$MYIP" ] && ok "mail A record matches this server" || warn "mail A record vs server IP mismatch/unknown"
PTR=$(q -x "${MYIP:-0.0.0.0}"); echo "  PTR: ${PTR:-<none>}"
[ "${PTR%.}" = "$MAIL_HOST" ] && ok "PTR matches" || warn "PTR is not $MAIL_HOST (OK if all outbound goes through the relay)"
SPF=$(q TXT "$DOMAIN" | grep -i spf1); echo "  SPF: $SPF"
[ -n "$SPF" ] && ok "SPF present" || bad "SPF missing"
echo "  DKIM selectors:"
for s in dkim default; do echo "    $s: $(q TXT "$s._domainkey.$DOMAIN" | tr -d '"\n' | cut -c1-80)"; done
DKIM_LOCAL=$(ls "$MAIL_DIR"/data/conf/rspamd/dkim/ 2>/dev/null | head -3); echo "  mailcow DKIM key files: ${DKIM_LOCAL:-<none>}"
source "$MAIL_DIR/mailcow.conf" 2>/dev/null
SEL=$(dc exec -T redis-mailcow redis-cli -a "${REDISPASS:-}" --no-auth-warning HGET DKIM_SELECTORS "$DOMAIN" 2>/dev/null | tr -d '\r')
echo "  mailcow DKIM selector for $DOMAIN: ${SEL:-<unknown>}"
if [ -n "$SEL" ]; then
  LOCALPUB=$(dc exec -T redis-mailcow redis-cli -a "${REDISPASS:-}" --no-auth-warning HGET DKIM_PUB_KEYS "$DOMAIN" 2>/dev/null | tr -d '\r\n')
  DNSPUB=$(q TXT "$SEL._domainkey.$DOMAIN" | tr -d '" \n' | sed 's/.*p=//')
  [ -n "$LOCALPUB" ] && [ "$DNSPUB" = "$LOCALPUB" ] && ok "DKIM DNS matches mailcow key (selector $SEL)" || bad "DKIM DNS for selector '$SEL' missing or does not match mailcow key"
fi
echo "  DMARC: $(q TXT "_dmarc.$DOMAIN" | tr -d '\n')"
echo "  MTA-STS: $(q TXT "_mta-sts.$DOMAIN" | tr -d '\n')   TLS-RPT: $(q TXT "_smtp._tls.$DOMAIN" | tr -d '\n')"
for h in autodiscover autoconfig; do echo "  $h: $(q "$h.$DOMAIN" | tr '\n' ' ')"; done

hdr "Security"
dc exec -T rspamd-mailcow rspamadm configtest >/dev/null 2>&1 && ok "rspamd config valid" || warn "rspamd configtest failed/unavailable"
echo "  fail2ban (netfilter) active bans: $(dc exec -T redis-mailcow redis-cli -a "${REDISPASS:-}" --no-auth-warning HLEN F2B_ACTIVE_BANS 2>/dev/null | tr -d '\r')"
echo "  mailcow admins (2FA):"
dc exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "SELECT a.username, a.active, IF(t.id IS NULL,'no-2FA','2FA') FROM admin a LEFT JOIN tfa t ON t.username=a.username AND t.active=1;" 2>/dev/null | sed 's/^/    /'
echo "  mailboxes:"
dc exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "SELECT username, active, ROUND(quota/1048576) AS quota_mb FROM mailbox;" 2>/dev/null | sed 's/^/    /'
echo "  aliases:"
dc exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "SELECT address, goto, active FROM alias WHERE address<>goto;" 2>/dev/null | sed 's/^/    /'
grep -qE '^ADMIN_JWT_SECRET=.{32,}' "$APP_DIR/.env" 2>/dev/null && ok "website ADMIN_JWT_SECRET strong" || bad "website ADMIN_JWT_SECRET missing/short"
grep -qE '^MAILCOW_API_KEY=.+' "$APP_DIR/.env" 2>/dev/null && ok "website MAILCOW_API_KEY set" || warn "website MAILCOW_API_KEY not set yet"

hdr "HTTP routing (local)"
for path in / /SOGo/ /admin /api/v1/get/status/version /Microsoft-Server-ActiveSync "/mail/config-v1.1.xml?emailaddress=test@$DOMAIN"; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$MAIL_HOST:443:127.0.0.1" "https://$MAIL_HOST$path")
  echo "  https://$MAIL_HOST$path -> $code"
done
API_CODE=$(curl -sk -o /dev/null -w '%{http_code}' -H "X-API-Key: $(grep -E '^API_KEY=' "$MAIL_DIR/mailcow.conf" | cut -d= -f2-)" http://127.0.0.1:8088/api/v1/get/status/version)
[ "$API_CODE" = "200" ] && ok "mail API reachable from host with API_KEY" || warn "mail API from host returned $API_CODE (check API_ALLOW_FROM)"
echo "  website service: $(systemctl is-active embeddedindia 2>/dev/null)  user: $(systemctl show -p User --value embeddedindia 2>/dev/null)"
echo "  website deployed commit: $(cd "$APP_DIR" && (git log -1 --format='%h %s' 2>/dev/null || cat .release 2>/dev/null || echo unknown))"
grep -q "isDemo" "$APP_DIR/src/routes/webmail.js" 2>/dev/null && bad "live website still has the webmail demo/auth-bypass code (Phase 0 not deployed)" || ok "Phase 0 webmail fix deployed"

hdr "Backups"
ls -1dt /opt/backups/* "$MAIL_DIR"/../mailcow-backup* 2>/dev/null | head -3 | sed 's/^/  /' || true
crontab -l 2>/dev/null | grep -i backup | sed 's/^/  cron: /'
ls /etc/cron.d 2>/dev/null | grep -i -E 'mail|backup' | sed 's/^/  cron.d: /'
[ -n "$(find /opt/backups -maxdepth 2 -mtime -2 2>/dev/null | head -1)" ] && ok "recent backup (<48h)" || warn "no recent mail backup found"

echo
echo "== SUMMARY: PASS=$PASS WARN=$WARN FAIL=$FAIL =="
