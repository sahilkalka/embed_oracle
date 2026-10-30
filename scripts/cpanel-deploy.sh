#!/usr/bin/env bash
# cPanel Git deployment uses the same target resolver as GitHub Actions.
set -Eeuo pipefail
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$SOURCE_ROOT"

target="embeddedindia.in"

resolved="$(bash server-deploy.sh "$target" --print-target)"
IFS='|' read -r domain app_root activate <<< "$resolved"
if [ "${2:-}" = --print-target ]; then
  printf '%s\n' "$resolved"
  exit 0
fi
echo "cPanel Git deployment target: https://$domain ($app_root)"
[ -f "$activate" ] || { echo "Missing Node environment: $activate" >&2; exit 1; }
mkdir -p "$app_root/tmp" "$app_root/prisma"
if [ "$SOURCE_ROOT" != "$app_root" ]; then
  # Explicit source files only; never overwrite server configuration, data or uploads.
  tar --exclude='public/uploads' --exclude='public/downloads' -cf - \
    src views public scripts package.json package-lock.json app.js server-deploy.sh \
    tailwind.config.js prisma/schema.prisma | (cd "$app_root" && tar -xf -)
fi
exec /bin/bash "$app_root/server-deploy.sh" "$domain" update