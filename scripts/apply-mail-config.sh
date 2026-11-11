#!/usr/bin/env bash
# ==============================================================================
# scripts/apply-mail-config.sh — idempotent mail-server hardening (Phase 1)
#
#   sudo bash scripts/apply-mail-config.sh            # apply everything
#   sudo bash scripts/apply-mail-config.sh --dry-run  # show what would change
#
# Safe to re-run. Each step checks current state first and only changes what is needed.
#  1. Trusted TLS for IMAP/SMTP: copy the Let's Encrypt cert into mailcow (+ renewal hook)
#  2. Add autodiscover/autoconfig/mta-sts to the cert once their DNS points here
#  3. Remove duplicate host firewall rules
#  4. Install the host nginx vhost (admin UI + API no longer public, MTA-STS policy)
#  5. Daily mail backups (7-day retention)
#  6. Create the mailcow DKIM key if missing, report aliases, print DNS records to publish
# ==============================================================================
set -euo pipefail

DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIL_DIR="${MAIL_DIR:-/embed_mail}"
DOMAIN="${DOMAIN:-embeddedindia.in}"
MAIL_HOST="${MAIL_HOST:-mail.embeddedindia.in}"
LIVE="/etc/letsencrypt/live/${MAIL_HOST}"
SSL_DIR="${MAIL_DIR}/data/assets/ssl"
HOOK="/etc/letsencrypt/renewal-hooks/deploy/50-mailcow-cert.sh"
VHOST_SRC="${ROOT_DIR}/embed_mail/nginx/mail.embeddedindia.in.conf"
VHOST_DST="/etc/nginx/sites-available/${MAIL_HOST}.conf"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/mailcow}"
# Mailbox that receives DMARC / TLS-RPT reports (via the dmarc@ and tlsrpt@ aliases)
REPORTS_TO="${REPORTS_TO:-info@${DOMAIN}}"

run()  { if [ "$DRY" = 1 ]; then echo "    [dry-run] $*"; else "$@"; fi; }
step() { echo; echo "==> $*"; }
note() { echo "    $*"; }

# shellcheck disable=SC1091
source "${MAIL_DIR}/mailcow.conf"
SERVER_IP="$(curl -s -4 -m 8 https://ifconfig.me || true)"

# ------------------------------------------------------------------------------
step "1/6 Trusted TLS certificate for IMAP/SMTP (ports 993/465/587)"
mkdir -p "$(dirname "$HOOK")"
HOOK_BODY=$(cat <<EOF
#!/usr/bin/env bash
# Installed by apply-mail-config.sh. Runs after certbot renews ${MAIL_HOST}:
# copies the certificate into mailcow and restarts the services that use it.
set -euo pipefail
LIVE="${LIVE}"
SSL_DIR="${SSL_DIR}"
if [ -n "\${RENEWED_LINEAGE:-}" ] && [ "\${RENEWED_LINEAGE}" != "\${LIVE}" ]; then exit 0; fi
if cmp -s "\${LIVE}/fullchain.pem" "\${SSL_DIR}/cert.pem" && cmp -s "\${LIVE}/privkey.pem" "\${SSL_DIR}/key.pem"; then
  echo "mailcow certificate already current"; exit 0
fi
[ -f "\${SSL_DIR}/cert.pem.selfsigned" ] || cp -a "\${SSL_DIR}/cert.pem" "\${SSL_DIR}/cert.pem.selfsigned" 2>/dev/null || true
[ -f "\${SSL_DIR}/key.pem.selfsigned" ]  || cp -a "\${SSL_DIR}/key.pem"  "\${SSL_DIR}/key.pem.selfsigned"  2>/dev/null || true
install -m 644 "\${LIVE}/fullchain.pem" "\${SSL_DIR}/cert.pem"
install -m 600 "\${LIVE}/privkey.pem"  "\${SSL_DIR}/key.pem"
cd "${MAIL_DIR}" && docker compose restart postfix-mailcow dovecot-mailcow nginx-mailcow </dev/null
echo "mailcow certificate updated from Let's Encrypt"
EOF
)
if [ -f "$HOOK" ] && [ "$(cat "$HOOK")" = "$HOOK_BODY" ]; then
  note "renewal hook already installed: $HOOK"
else
  note "installing renewal hook: $HOOK"
  if [ "$DRY" = 0 ]; then printf '%s\n' "$HOOK_BODY" > "$HOOK"; chmod 755 "$HOOK"; fi
fi
if [ -f "${LIVE}/fullchain.pem" ]; then
  run env RENEWED_LINEAGE="$LIVE" bash "$HOOK"
else
  note "WARNING: ${LIVE} not found; obtain the certificate first (scripts/deploy-email-server.sh)."
fi

# ------------------------------------------------------------------------------
step "2/6 Certificate names (autodiscover / autoconfig / mta-sts)"
CERT_DOMAINS=(-d "$MAIL_HOST")
MISSING=()
for h in autodiscover autoconfig mta-sts; do
  fqdn="${h}.${DOMAIN}"
  ip="$(dig +short @1.1.1.1 A "$fqdn" | tail -n1)"
  if [ -n "$SERVER_IP" ] && [ "$ip" = "$SERVER_IP" ]; then CERT_DOMAINS+=(-d "$fqdn"); else MISSING+=("$fqdn -> ${ip:-none}"); fi
done
CURRENT_SANS="$(openssl x509 -in "${LIVE}/cert.pem" -noout -ext subjectAltName 2>/dev/null | tr -d ' \n' | sed 's/^[^:]*://; s/DNS://g')"
WANTED_SANS="$(printf '%s\n' "${CERT_DOMAINS[@]}" | grep -v '^-d$' | paste -sd, -)"
note "certificate covers: ${CURRENT_SANS:-unknown}"
if [ ${#MISSING[@]} -gt 0 ]; then
  note "not yet pointing to this server (${SERVER_IP:-?}), skipped:"
  for m in "${MISSING[@]}"; do note "  - $m"; done
  note "set them in Cloudflare as DNS-only (grey cloud) records, then re-run this script."
fi
if [ "$(tr ',' '\n' <<<"$CURRENT_SANS" | sort | paste -sd,)" != "$(tr ',' '\n' <<<"$WANTED_SANS" | sort | paste -sd,)" ]; then
  note "expanding certificate to: $WANTED_SANS"
  run certbot certonly --webroot -w /var/www/certbot --cert-name "$MAIL_HOST" "${CERT_DOMAINS[@]}" \
      --expand --non-interactive --agree-tos --keep-until-expiring --deploy-hook "$HOOK"
else
  note "certificate names already correct"
fi

# ------------------------------------------------------------------------------
step "3/6 Remove duplicate firewall rules"
RULES="$(iptables -S INPUT)"
FIRST_REJECT=$(grep -n -m1 -E -- '-j (REJECT|DROP)' <<<"$RULES" | cut -d: -f1 || true)
REMOVED=0
while IFS= read -r rule; do
  [ -z "$rule" ] && continue
  count=$(grep -cxF -- "$rule" <<<"$RULES")
  last=$(grep -nxF -- "$rule" <<<"$RULES" | tail -n1 | cut -d: -f1)
  if [ -n "$FIRST_REJECT" ] && [ "$last" -gt "$FIRST_REJECT" ]; then
    note "skipping (a copy sits after the REJECT rule): $rule"; continue
  fi
  read -r -a spec <<<"${rule#-A INPUT }"
  for _ in $(seq 2 "$count"); do run iptables -D INPUT "${spec[@]}"; REMOVED=$((REMOVED+1)); done
done < <(grep -E -- '-j ACCEPT' <<<"$RULES" | sort | uniq -d)
if [ "$REMOVED" -gt 0 ]; then
  note "removed $REMOVED duplicate rules"
  command -v netfilter-persistent >/dev/null && run netfilter-persistent save
else
  note "no duplicates"
fi

# ------------------------------------------------------------------------------
step "4/6 Host nginx vhost for ${MAIL_HOST}"
if cmp -s "$VHOST_SRC" "$VHOST_DST"; then
  note "already up to date"
else
  note "installing $VHOST_DST (previous copy kept as .bak)"
  if [ "$DRY" = 0 ]; then
    [ -f "$VHOST_DST" ] && cp -a "$VHOST_DST" "${VHOST_DST}.bak"
    cp "$VHOST_SRC" "$VHOST_DST"
    ln -sf "$VHOST_DST" "/etc/nginx/sites-enabled/${MAIL_HOST}.conf"
    if nginx -t 2>&1 | tail -2; then
      systemctl reload nginx && note "nginx reloaded"
    else
      note "nginx config test FAILED, restoring previous vhost"
      [ -f "${VHOST_DST}.bak" ] && cp -a "${VHOST_DST}.bak" "$VHOST_DST"
      nginx -t && systemctl reload nginx
      exit 1
    fi
  fi
fi

# ------------------------------------------------------------------------------
step "5/6 Daily mail backups -> ${BACKUP_DIR} (keep 7 days)"
CRON_FILE=/etc/cron.d/mailcow-backup
CRON_BODY="# Installed by apply-mail-config.sh: full mailcow backup daily at 02:30 IST, 7-day retention
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root MAILCOW_BACKUP_LOCATION=${BACKUP_DIR} THREADS=2 ${MAIL_DIR}/helper-scripts/backup_and_restore.sh backup all --delete-days 7 </dev/null >> /var/log/mailcow-backup.log 2>&1"
if [ -f "$CRON_FILE" ] && [ "$(cat "$CRON_FILE")" = "$CRON_BODY" ]; then
  note "backup schedule already installed"
else
  note "installing $CRON_FILE"
  if [ "$DRY" = 0 ]; then mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"; printf '%s\n' "$CRON_BODY" > "$CRON_FILE"; chmod 644 "$CRON_FILE"; fi
fi
note "first backup now: sudo MAILCOW_BACKUP_LOCATION=${BACKUP_DIR} ${MAIL_DIR}/helper-scripts/backup_and_restore.sh backup all"

# ------------------------------------------------------------------------------
step "6/6 DKIM signing key for ${DOMAIN}"
api() { curl -sS -m 20 -H "X-API-Key: ${API_KEY}" -H 'Content-Type: application/json' "$@"; }
DKIM_JSON="$(api "http://127.0.0.1:${HTTP_PORT:-8088}/api/v1/get/dkim/${DOMAIN}" || true)"
if ! grep -q '"pubkey"' <<<"$DKIM_JSON"; then
  note "no DKIM key yet; creating 2048-bit key with selector 'dkim'"
  run api -X POST "http://127.0.0.1:${HTTP_PORT:-8088}/api/v1/add/dkim" \
      -d "{\"domains\":\"${DOMAIN}\",\"dkim_selector\":\"dkim\",\"key_size\":\"2048\"}"
  echo
  [ "$DRY" = 0 ] && DKIM_JSON="$(api "http://127.0.0.1:${HTTP_PORT:-8088}/api/v1/get/dkim/${DOMAIN}")"
else
  note "DKIM key exists"
fi
SELECTOR="$(python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("dkim_selector","dkim"))' <<<"$DKIM_JSON" 2>/dev/null || echo dkim)"
DKIM_TXT="$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("dkim_txt",""))' <<<"$DKIM_JSON" 2>/dev/null || true)"
PUBLISHED="$(dig +short @1.1.1.1 TXT "${SELECTOR}._domainkey.${DOMAIN}" | tr -d '" \n')"
if [ -n "$DKIM_TXT" ] && [ "$PUBLISHED" = "$(tr -d '" \n' <<<"$DKIM_TXT")" ]; then
  note "DKIM record is published and matches"
fi

note "report aliases -> ${REPORTS_TO}"
ALIASES_JSON="$(api "http://127.0.0.1:${HTTP_PORT:-8088}/api/v1/get/alias/all" || true)"
for a in dmarc tlsrpt; do
  if grep -q "\"address\": *\"${a}@${DOMAIN}\"" <<<"$ALIASES_JSON"; then
    note "  ${a}@${DOMAIN} exists"
  else
    note "  creating ${a}@${DOMAIN}"
    run api -X POST "http://127.0.0.1:${HTTP_PORT:-8088}/api/v1/add/alias"         -d "{\"address\":\"${a}@${DOMAIN}\",\"goto\":\"${REPORTS_TO}\",\"active\":\"1\"}"
    echo
  fi
done

# ------------------------------------------------------------------------------
echo
echo "================================================================================"
echo " DNS records to set in Cloudflare (all DNS only / grey cloud)"
echo "================================================================================"
if [ -n "$DKIM_TXT" ] && [ "$PUBLISHED" != "$(tr -d '" \n' <<<"$DKIM_TXT")" ]; then
  echo " TXT   ${SELECTOR}._domainkey     ${DKIM_TXT}"
fi
echo " CNAME autodiscover            ${MAIL_HOST}"
echo " CNAME autoconfig              ${MAIL_HOST}"
echo " A     mta-sts                 ${SERVER_IP:-<server IP>}"
echo " TXT   _mta-sts                v=STSv1; id=$(date +%Y%m%d)01"
echo " TXT   _smtp._tls              v=TLSRPTv1; rua=mailto:tlsrpt@${DOMAIN}"
echo " TXT   _dmarc                  v=DMARC1; p=quarantine; rua=mailto:dmarc@${DOMAIN}; adkim=r; aspf=r"
echo
echo " Review (only if you no longer use Hostinger mail):"
echo "   - delete MX mx1.hostinger.com and mx2.hostinger.com"
echo "   - SPF: v=spf1 mx a:${MAIL_HOST} include:rp.oracleemaildelivery.com ~all"
echo
echo " Then re-run: sudo bash scripts/apply-mail-config.sh   and   sudo bash scripts/mail-audit.sh"
