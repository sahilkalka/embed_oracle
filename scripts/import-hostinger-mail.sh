#!/usr/bin/env bash
# ==============================================================================
# Interactive Hostinger (or any IMAP) -> Mailcow Mailbox Import
# Uses Mailcow's built-in imapsync inside dovecot-mailcow with Dovecot master
# authentication so the destination mailbox password is never needed and the
# source password is held only in an ephemeral 0600 file inside the container.
#
# Usage:
#   sudo bash scripts/import-hostinger-mail.sh
#   sudo bash scripts/import-hostinger-mail.sh --src-email info@embeddedindia.in --dst-email info@embeddedindia.in --dry-run
# ==============================================================================
set -euo pipefail

EMBED_MAIL_DIR="${EMBED_MAIL_DIR:-/embed_mail}"
SRC_HOST="imap.hostinger.com"
SRC_PORT="993"
SRC_EMAIL=""
DST_EMAIL=""
DRY_RUN=0
INBOX_SENT_ONLY=0
AUTO_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) SRC_HOST="${2:?}"; shift 2 ;;
    --port) SRC_PORT="${2:?}"; shift 2 ;;
    --src-email) SRC_EMAIL="${2:?}"; shift 2 ;;
    --dst-email) DST_EMAIL="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --inbox-sent-only) INBOX_SENT_ONLY=1; shift ;;
    --yes|-y) AUTO_YES=1; shift ;;
    -h|--help)
      echo "Usage: sudo bash $0 [--src-email EMAIL] [--dst-email EMAIL] [--host imap.hostinger.com] [--port 993] [--inbox-sent-only] [--dry-run] [--yes]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${EMBED_MAIL_DIR}/docker-compose.yml" ]]; then
  echo "ERROR: ${EMBED_MAIL_DIR}/docker-compose.yml not found." >&2
  exit 1
fi

dc() {
  docker compose -f "${EMBED_MAIL_DIR}/docker-compose.yml" exec -T dovecot-mailcow "$@"
}

echo "============================================================"
echo "  Embedded India Mail — Hostinger / IMAP Mailbox Importer"
echo "============================================================"
echo

if [[ -z "$DST_EMAIL" ]]; then
  read -r -p "Destination Mailcow mailbox [info@embeddedindia.in]: " DST_EMAIL
  DST_EMAIL="${DST_EMAIL:-info@embeddedindia.in}"
fi

if [[ -z "$SRC_EMAIL" ]]; then
  read -r -p "Source Hostinger email [${DST_EMAIL}]: " SRC_EMAIL
  SRC_EMAIL="${SRC_EMAIL:-$DST_EMAIL}"
fi

read -r -p "Source IMAP host [${SRC_HOST}]: " INPUT_HOST
SRC_HOST="${INPUT_HOST:-$SRC_HOST}"

read -r -p "Source IMAP port [${SRC_PORT}]: " INPUT_PORT
SRC_PORT="${INPUT_PORT:-$SRC_PORT}"

if ! dc doveadm user "$DST_EMAIL" >/dev/null 2>&1; then
  echo "ERROR: Destination mailbox '${DST_EMAIL}' does not exist on this server." >&2
  echo "Create it first in https://embeddedindia.in/admin/email -> Mailboxes." >&2
  exit 1
fi

MASTER_CREDS=$(dc cat /etc/sogo/sieve.creds)
MASTER_USER="${MASTER_CREDS%%:*}"
MASTER_PASS="${MASTER_CREDS#*:}"
MASTER_PASS="${MASTER_PASS%$'\r'}"
if [[ -z "$MASTER_USER" || -z "$MASTER_PASS" ]]; then
  echo "ERROR: Could not read internal Dovecot master credentials." >&2
  exit 1
fi

read -r -s -p "Password for Hostinger mailbox '${SRC_EMAIL}': " SRC_PASS
echo
if [[ -z "$SRC_PASS" ]]; then
  echo "ERROR: Source password cannot be empty." >&2
  exit 1
fi

PASS1_FILE=$(dc mktemp /tmp/import-src.XXXXXX)
PASS2_FILE=$(dc mktemp /tmp/import-dst.XXXXXX)

cleanup() {
  dc rm -f "$PASS1_FILE" "$PASS2_FILE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

dc sh -c "chmod 600 '$PASS1_FILE' '$PASS2_FILE'"
printf '%s\n' "$SRC_PASS" | dc sh -c "cat > '$PASS1_FILE'"
printf '%s\n' "$MASTER_PASS" | dc sh -c "cat > '$PASS2_FILE'"
unset SRC_PASS MASTER_PASS MASTER_CREDS

COMMON_ARGS=(
  /usr/local/bin/imapsync
  --host1 "$SRC_HOST" --port1 "$SRC_PORT" --ssl1
  --sslargs1 SSL_verifycn_scheme=imap
  --sslargs1 "SSL_verifycn_name=${SRC_HOST}"
  --sslargs1 "SSL_hostname=${SRC_HOST}"
  --sslargs1 SSL_verify_mode=1
  --user1 "$SRC_EMAIL" --passfile1 "$PASS1_FILE"
  --host2 localhost
  --user2 "${DST_EMAIL}*${MASTER_USER}" --passfile2 "$PASS2_FILE"
  --automap --subscribeall --skipcrossduplicates --addheader --nofoldersizes --nolog
  --no-modulesversion --noreleasecheck
)

if [[ "$INBOX_SENT_ONLY" -eq 1 ]]; then
  COMMON_ARGS+=(--include '^(INBOX|INBOX\.Sent|Sent|Sent Items|Sent Messages)$')
fi

echo
echo "==> Step 1/2: Verifying Hostinger login and inspecting folders..."
if ! dc "${COMMON_ARGS[@]}" --justfolders --dry; then
  echo
  echo "ERROR: Could not log in or list folders on ${SRC_HOST}:${SRC_PORT} for ${SRC_EMAIL}." >&2
  echo "Double-check your Hostinger mailbox password (and ensure IMAP access is enabled in Hostinger hPanel)." >&2
  exit 1
fi

echo
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> Step 2/2: Running DRY-RUN sync (--dry, nothing will be written)..."
  dc "${COMMON_ARGS[@]}" --dry
  exit 0
fi

if [[ "$AUTO_YES" -ne 1 ]]; then
  read -r -p "Proceed with importing all listed folders into '${DST_EMAIL}'? [y/N]: " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted by user."
    exit 0
  fi
fi

echo
echo "==> Step 2/2: Importing emails (Inbox, Sent, Drafts, Trash, Spam, custom folders)..."
echo "    Source is read-only; no messages will be deleted from Hostinger."
echo
dc "${COMMON_ARGS[@]}"

echo
echo "==> Import complete! Open https://mail.embeddedindia.in/ and check Inbox, Sent, and folders."
