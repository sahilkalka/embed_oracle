#!/usr/bin/env bash
# ==============================================================================
# Helper Script to Configure Outbound SMTP Relay in Mailcow (/embed_mail)
# Use this if Port 25 Outbound is blocked on Oracle Cloud.
# ==============================================================================
set -Eeuo pipefail

MAIL_DIR="/embed_mail"
POSTFIX_CUSTOM="${MAIL_DIR}/data/conf/postfix/extra.cf"
SASL_FILE="${MAIL_DIR}/data/conf/postfix/sasl_passwd"
BEGIN_MARK="# BEGIN EMBEDDEDINDIA RELAY"
END_MARK="# END EMBEDDEDINDIA RELAY"

strip_relay_block() {
  local file="$1"
  [ -f "$file" ] || return 0
  python3 - "$file" "$BEGIN_MARK" "$END_MARK" <<'PY'
import sys
path, begin, end = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()
out = []
in_block = False
legacy_prefixes = (
    'relayhost =',
    'smtp_sasl_auth_enable =',
    'smtp_sasl_password_maps =',
    'smtp_sasl_security_options =',
    'smtp_tls_security_level =',
    'smtp_tls_note_starttls_offer =',
)
for line in lines:
    s = line.strip()
    if s == begin:
        in_block = True
        continue
    if s == end:
        in_block = False
        continue
    if in_block or any(s.startswith(p) for p in legacy_prefixes):
        continue
    out.append(line)
with open(path, 'w', encoding='utf-8') as f:
    f.writelines(out)
PY
}

CHOICE="${RELAY_CHOICE:-}"
if [ -z "$CHOICE" ]; then
  echo "=================================================================="
  echo " Mailcow Outbound Relay Configuration Helper"
  echo "=================================================================="
  echo "Select your preferred zero-cost or high-reputation outbound relay:"
  echo " 1) OCI Native Email Delivery (3,000 emails/mo FREE - inside Oracle Cloud)"
  echo " 2) Brevo / Sendinblue (300 emails/day = 9,000/mo FREE)"
  echo " 3) Amazon SES (Top reputation, ~\$0.10 per 1,000 emails)"
  echo " 4) Custom SMTP Relay"
  echo " 5) Remove Relay (Direct Send via Port 25 once unblocked)"
  echo "=================================================================="
  read -r -p "Enter choice [1-5]: " CHOICE
fi

case "$CHOICE" in
  1)
    echo "--- OCI Native Email Delivery Configuration ---"
    [ -n "${RELAY_HOST:-}" ] || read -r -p "Enter OCI Region SMTP Host (e.g., smtp.email.ap-hyderabad-1.oci.oraclecloud.com): " RELAY_HOST
    [ -n "${RELAY_USER:-}" ] || read -r -p "Enter OCI SMTP Username (OCID): " RELAY_USER
    [ -n "${RELAY_PASS:-}" ] || read -r -s -p "Enter OCI SMTP Password: " RELAY_PASS
    echo
    PORT="${RELAY_PORT:-587}"
    ;;
  2)
    echo "--- Brevo / Sendinblue Configuration ---"
    RELAY_HOST="${RELAY_HOST:-smtp-relay.brevo.com}"
    PORT="${RELAY_PORT:-587}"
    [ -n "${RELAY_USER:-}" ] || read -r -p "Enter Brevo SMTP Login Email: " RELAY_USER
    [ -n "${RELAY_PASS:-}" ] || read -r -s -p "Enter Brevo SMTP Master Key/Password: " RELAY_PASS
    echo
    ;;
  3)
    echo "--- Amazon SES Configuration ---"
    [ -n "${RELAY_HOST:-}" ] || read -r -p "Enter SES SMTP Endpoint (e.g. email-smtp.ap-south-1.amazonaws.com): " RELAY_HOST
    PORT="${RELAY_PORT:-587}"
    [ -n "${RELAY_USER:-}" ] || read -r -p "Enter SES SMTP Username (IAM SMTP user): " RELAY_USER
    [ -n "${RELAY_PASS:-}" ] || read -r -s -p "Enter SES SMTP Password: " RELAY_PASS
    echo
    ;;
  4)
    [ -n "${RELAY_HOST:-}" ] || read -r -p "Enter Relay Host: " RELAY_HOST
    if [ -z "${RELAY_PORT:-}" ]; then
      read -r -p "Enter Relay Port (default 587): " PORT
      PORT=${PORT:-587}
    else
      PORT="${RELAY_PORT}"
    fi
    [ -n "${RELAY_USER:-}" ] || read -r -p "Enter Relay Username: " RELAY_USER
    [ -n "${RELAY_PASS:-}" ] || read -r -s -p "Enter Relay Password: " RELAY_PASS
    echo
    ;;
  5)
    echo "Removing relay configuration for direct Port 25 send..."
    mkdir -p "$(dirname "${POSTFIX_CUSTOM}")"
    strip_relay_block "${POSTFIX_CUSTOM}"
    rm -f "${SASL_FILE}"
    echo "Direct send restored."
    if [ -d "${MAIL_DIR}" ] && docker compose -f "${MAIL_DIR}/docker-compose.yml" ps --services 2>/dev/null | grep -q 'postfix-mailcow'; then
      echo "Restarting Postfix..."
      cd "${MAIL_DIR}" && docker compose restart postfix-mailcow
    fi
    echo "Done!"
    exit 0
    ;;
  *)
    echo "Invalid selection." >&2
    exit 1
    ;;
esac

if [ -z "${RELAY_HOST}" ] || [ -z "${RELAY_USER}" ] || [ -z "${RELAY_PASS}" ]; then
  echo "ERROR: Relay host, username, and password are all required." >&2
  exit 1
fi

# Ensure target directory exists in /embed_mail
mkdir -p "${MAIL_DIR}/data/conf/postfix"

# Create Postfix sasl_passwd inside data/conf/postfix
printf '[%s]:%s %s:%s\n' "${RELAY_HOST}" "${PORT}" "${RELAY_USER}" "${RELAY_PASS}" > "${SASL_FILE}"
chmod 600 "${SASL_FILE}"

# Replace managed relay block in Postfix extra.cf cleanly
touch "${POSTFIX_CUSTOM}"
strip_relay_block "${POSTFIX_CUSTOM}"
cat >> "${POSTFIX_CUSTOM}" <<EOF
${BEGIN_MARK}
relayhost = [${RELAY_HOST}]:${PORT}
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = texthash:/opt/postfix/conf/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_tls_security_level = encrypt
smtp_tls_note_starttls_offer = yes
${END_MARK}
EOF

echo "Relay configured successfully!"
if [ -d "${MAIL_DIR}" ] && docker compose -f "${MAIL_DIR}/docker-compose.yml" ps --services 2>/dev/null | grep -q 'postfix-mailcow'; then
  echo "Restarting Postfix container..."
  cd "${MAIL_DIR}" && docker compose restart postfix-mailcow
  echo "Postfix restarted. Outbound mail will now route through [${RELAY_HOST}]:${PORT}."
else
  echo "Note: Mailcow containers are not currently running."
  echo "Once you run 'sudo bash /var/www/embeddedindia/scripts/deploy-email-server.sh', Postfix will boot with this relay."
fi
