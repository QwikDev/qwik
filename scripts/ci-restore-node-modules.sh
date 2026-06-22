#!/usr/bin/env bash
set -euo pipefail

archive="${1:-}"

if [[ -z "$archive" ]]; then
  node_modules_output="$(nix build .#node-modules --no-link --print-out-paths)"
  archive="$node_modules_output/node_modules.tar.zst"
fi

if [[ ! -f "$archive" ]]; then
  echo "Missing node_modules archive: $archive" >&2
  exit 1
fi

rm -rf node_modules
find packages e2e -mindepth 2 -maxdepth 2 -type d -name node_modules -prune -exec rm -rf {} +

tar --zstd -xf "$archive"

if [[ ! -f node_modules/.pnpm/lock.yaml || ! -x node_modules/.bin/vite ]]; then
  echo "Restored node_modules archive did not create the expected pnpm layout" >&2
  exit 1
fi

echo "Restored node_modules from $archive"
