#!/usr/bin/env bash
set -euo pipefail

cache_dir=$1
apt-get update -qq

for deb in "$cache_dir"/*.deb; do
  [[ -e $deb ]] || continue
  if ! fields=$(dpkg-deb --show --showformat='${Package} ${Version} ${Architecture}' "$deb" 2>/dev/null); then
    echo "Skipping $(basename "$deb"): not a valid package"
    continue
  fi
  read -r name version arch <<<"$fields"
  if [[ $arch == all ]]; then
    spec="$name=$version"
  else
    spec="$name:$arch=$version"
  fi
  actual_sha256=$(sha256sum "$deb" | cut -d' ' -f1)
  indexed_sha256s=$(apt-cache show "$spec" 2>/dev/null | sed -n 's/^SHA256: //p') || true
  # apt trusts a cached .deb of the right size without checking its hash.
  if ! grep -qxF "$actual_sha256" <<<"$indexed_sha256s"; then
    echo "Skipping $(basename "$deb"): not in the signed package index"
    continue
  fi
  cp "$deb" "/var/cache/apt/archives/${name}_${version//:/%3a}_${arch}.deb"
done
