#!/usr/bin/env bash
set -euo pipefail

attr="${1:-.#node-modules}"
tmpdir="${TMPDIR:-/tmp}"
log="$(mktemp "${tmpdir%/}/ci-build-node-modules.XXXXXX")"

cleanup() {
  rm -f "$log"
}
trap cleanup EXIT

if ! system="$(nix eval --raw --impure --expr builtins.currentSystem 2>/dev/null)"; then
  system="current system"
fi

set +e
nix build "$attr" --no-link --print-out-paths 2>&1 | tee "$log"
status="${PIPESTATUS[0]}"
set -e

if [[ "$status" -eq 0 ]]; then
  exit 0
fi

got_hash="$(sed -nE 's/^[[:space:]]*got:[[:space:]]*(sha256-[A-Za-z0-9+/=]+).*/\1/p' "$log" | tail -n 1)"

if [[ -n "$got_hash" ]]; then
  echo "::error file=flake.nix,title=Update pnpmDepsHash::The Nix pnpm dependency hash is stale for ${system}. Set pnpmDepsHash.${system} to ${got_hash}, then rerun this job."
  echo "::group::How to update pnpmDepsHash"
  echo "Update flake.nix:"
  echo
  echo "  ${system} = \"${got_hash}\";"
  echo
  echo "Then rerun:"
  echo
  echo "  bash scripts/ci-build-node-modules.sh"
  echo "::endgroup::"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      echo "## Update pnpmDepsHash"
      echo
      echo "The Nix pnpm dependency hash is stale for \`${system}\`."
      echo
      echo "Set this value in \`flake.nix\`:"
      echo
      echo '```nix'
      echo "${system} = \"${got_hash}\";"
      echo '```'
      echo
      echo "Then rerun:"
      echo
      echo '```sh'
      echo "bash scripts/ci-build-node-modules.sh"
      echo '```'
    } >> "$GITHUB_STEP_SUMMARY"
  fi
else
  echo "::error title=node_modules archive build failed::nix build ${attr} failed. See the log above for details."
fi

exit "$status"
