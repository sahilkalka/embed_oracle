# Secret Rotation Checklist

These secrets were committed to git and must be treated as public. Removing them from the
files does **not** protect you; only rotating them does. Work through the steps in order.

## 1. SSH deploy key

```bash
# On your workstation
ssh-keygen -t ed25519 -f keys/ei-deploy-$(date +%Y%m%d) -C "embeddedindia-deploy"

# Install the new public key, then confirm you can log in with it
ssh -i keys/ssh-key-2026-10-30.key ubuntu@129.225.79.183 \
  "cat >> ~/.ssh/authorized_keys" < keys/ei-deploy-YYYYMMDD.pub
ssh -i keys/ei-deploy-YYYYMMDD ubuntu@129.225.79.183 "echo ok"

# Only after the new key works: remove the old key from the server
ssh -i keys/ei-deploy-YYYYMMDD ubuntu@129.225.79.183 \
  "sed -i '/$(cut -d' ' -f2 keys/ssh-key-2026-10-30.key.pub | sed 's/[\/&]/\\&/g')/d' ~/.ssh/authorized_keys"
```

Then do the following:
- Update the GitHub secret: Repo > Settings > Secrets and variables > Actions > `ORACLE_SSH_KEY`. Paste the new private key.
- Set `ORACLE_SSH_KEY_PATH=keys/ei-deploy-YYYYMMDD` for local `scripts/oracle-deploy.sh` runs.
- Delete the old key files locally.

## 2. OCI Email Delivery SMTP credential

1. In the OCI Console, go to Profile > User settings > SMTP credentials. Delete the leaked credential and generate a new one.
2. On the server, run `sudo bash /var/www/embeddedindia/scripts/setup-outbound-relay.sh` and enter the new credential.
   This rewrites `/embed_mail/data/conf/postfix/sasl_passwd`.
3. Confirm the queue drains: `docker compose -f /embed_mail/docker-compose.yml exec postfix-mailcow postqueue -p`.

## 3. Mail server (mailcow) admin and API keys

```bash
cd /embed_mail
# New admin password; this also clears the admin's 2FA, so re-enroll it afterwards
ADMIN_PASSWORD="$(openssl rand -base64 24)" ; echo "$ADMIN_PASSWORD"
sudo -E ADMIN_PASSWORD="$ADMIN_PASSWORD" bash /var/www/embeddedindia/scripts/fix-embed-mail.sh

# New API keys (read-write + read-only)
sudo sed -i "s/^API_KEY=.*/API_KEY=$(openssl rand -hex 24)/; s/^API_KEY_READ_ONLY=.*/API_KEY_READ_ONLY=$(openssl rand -hex 24)/; s/^API_ALLOW_FROM=.*/API_ALLOW_FROM=127.0.0.1,172.22.1.1/" mailcow.conf
sudo docker compose up -d
grep -E '^API_KEY=' mailcow.conf   # copy this value into the website .env as MAILCOW_API_KEY
```

Then enable TOTP for `admin` in the mail admin UI.

## 4. Website JWT secret

`scripts/oracle-deploy.sh` now replaces a missing, short or previously committed `ADMIN_JWT_SECRET` automatically.
To rotate it manually:

```bash
sudo sed -i "s/^ADMIN_JWT_SECRET=.*/ADMIN_JWT_SECRET=$(openssl rand -hex 32)/" /var/www/embeddedindia/.env
sudo systemctl restart embeddedindia
```

All admins and webmail users are signed out.

## 5. Website admin password

The code no longer accepts the old hardcoded fallback passwords. If your admin password was one of them
(or `ADMIN_DEFAULT_PASSWORD` from the old `.env.example`), reset it:

```bash
# Run as the app owner (ubuntu), not www-data, so SQLite can open prisma/dev.db
cd /var/www/embeddedindia
NEW_ADMIN_PASS="$(openssl rand -base64 24)"
node scripts/reset-admin.js admin@embeddedindia.in "$NEW_ADMIN_PASS"
echo "New admin password: $NEW_ADMIN_PASS"   # store it in your password manager
```

## 6. Mailboxes

Reset the password of every mailbox whose password appeared in scripts or pages:
`dummy@`, `info@`, `sahil@`, `support@`. Use the mail admin until the website admin pages ship in Phase 3.

## 7. Git history (optional, destructive)

The secrets stay in old commits until the history is rewritten:
```bash
pip install git-filter-repo
# Put each leaked value on its own line in a LOCAL, uncommitted file (e.g. ../leaked.txt):
# the old mail API key, mail admin password, website admin passwords, OCI SMTP password, JWT secrets.
git filter-repo --invert-paths --path keys/ --replace-text ../leaked.txt
git push --force --all
```
Every clone and CI cache must re-clone afterwards. Rotation (steps 1–6) is still required either way.
