#!/usr/bin/env bash
# Download the GitHub App PEM from Key Vault and mint a short-lived installation token.
# Never prints the PEM or token. Token is written to GITHUB_OUTPUT when --github-output is set.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="kv-wcp-shared"
GITHUB_OUTPUT_FLAG=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-keyvault)
      VAULT="${2:?}"
      shift 2
      ;;
    --github-output)
      GITHUB_OUTPUT_FLAG=(--github-output)
      shift
      ;;
    *)
      echo "Usage: scripts/mint-github-app-token.sh [--from-keyvault <vault>] [--github-output]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${GH_APP_ID:-}" || -z "${GH_APP_INSTALLATION_ID:-}" ]]; then
  echo "GH_APP_ID and GH_APP_INSTALLATION_ID must be set (repo Actions variables)." >&2
  exit 1
fi

pem="$(mktemp)"
cleanup() { rm -f "$pem"; }
trap cleanup EXIT
chmod 600 "$pem"

az keyvault secret download \
  --vault-name "$VAULT" \
  --name GITHUB-APP-PRIVATE-KEY \
  --file "$pem" \
  --encoding utf-8 \
  --output none \
  --only-show-errors

node "$ROOT/scripts/mint-github-app-token.mjs" \
  --app-id "$GH_APP_ID" \
  --installation-id "$GH_APP_INSTALLATION_ID" \
  --pem-file "$pem" \
  "${GITHUB_OUTPUT_FLAG[@]}"
