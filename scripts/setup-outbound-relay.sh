#!/usr/bin/env bash
# ==============================================================================
# Helper Script to Configure Outbound SMTP Relay in Mailcow (/embed_mail)
# Use this if Port 25 Outbound is blocked on Oracle Cloud.
# ==============================================================================
set -Eeuo pipefail

MAIL_DIR="/embed_mail"
POSTFIX_CUSTOM="${MAIL_DIR}/data/conf/postfix/extra.cf"

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

case "$CHOICE" in
  1)
    echo "--- OCI Native Email Delivery Configuration ---"
    read -r -p "Enter OCI Region SMTP Host (e.g., smtp.email.ap-hyderabad-1.oci.oraclecloud.com): " RELAY_HOST
    read -r -p "Enter OCI SMTP Username (OCID): " RELAY_USER
    read -r -p "Enter OCI SMTP Password: " RELAY_PASS
    PORT=587
    ;;
  2)
    echo "--- Brevo / Sendinblue Configuration ---"
    RELAY_HOST="smtp-relay.brevo.com"
    PORT=587
    read -r -p "Enter Brevo SMTP Login Email: " RELAY_USER
    read -r -p "Enter Brevo SMTP Master Key/Password: " RELAY_PASS
    ;;
  3)
    echo "--- Amazon SES Configuration ---"
    read -r -p "Enter SES SMTP Endpoint (e.g. email-smtp.us-east-1.amazonaws.com): " RELAY_HOST
    PORT=587
    read -r -p "Enter SES SMTP Username: " RELAY_USER
    read -r -p "Enter SES SMTP Password: " RELAY_PASS
    ;;
  4)
    read -r -p "Enter Relay Host: " RELAY_HOST
    read -r -p "Enter Relay Port (default 587): " PORT
    PORT=${PORT:-587}
    read -r -p "Enter Relay Username: " RELAY_USER
    read -r -p "Enter Relay Password: " RELAY_PASS
    ;;
  5)
    echo "Removing relay configuration for direct Port 25 send..."
    sed -i '/relayhost =/d' "${POSTFIX_CUSTOM}" 2>/dev/null || true
    echo "Direct send restored. Restarting Postfix..."
    cd "${MAIL_DIR}" && docker compose restart postfix-mailcow
    echo "Done!"
    exit 0
    ;;
  *)
    echo "Invalid selection." >&2
    exit 1
    ;;
esac

# Create Postfix sasl_passwd inside data/conf/postfix
SASL_FILE="${MAIL_DIR}/data/conf/postfix/sasl_passwd"
echo "[${RELAY_HOST}]:${PORT} ${RELAY_USER}:${RELAY_PASS}" > "${SASL_FILE}"
chmod 600 "${SASL_FILE}"

# Add to Postfix extra.cf
mkdir -p "$(dirname "${POSTFIX_CUSTOM}")"
sed -i '/relayhost =/d' "${POSTFIX_CUSTOM}" 2>/dev/null || true
cat >> "${POSTFIX_CUSTOM}" <<EOF
relayhost = [${RELAY_HOST}]:${PORT}
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = texthash:/opt/postfix/conf/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_tls_security_level = encrypt
smtp_tls_note_starttls_offer = yes
EOF

echo "Relay configured successfully! Restarting Postfix container..."
cd "${MAIL_DIR}" && docker compose restart postfix-mailcow
echo "Postfix restarted. Outbound mail will now route through [${RELAY_HOST}]:${PORT}."
