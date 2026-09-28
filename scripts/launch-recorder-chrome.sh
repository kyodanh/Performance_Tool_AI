#!/usr/bin/env bash
# Launch a Chrome that k6 Studio's proxy records, with CDP open so agents can drive it.
# Usage: scripts/launch-recorder-chrome.sh [url] [cdp-port]
set -euo pipefail

URL="${1:-about:blank}"
CDP_PORT="${2:-9224}"   # 9222 = recorder's browser, 9223 = the Electron app

# Actual listen port, straight off the running proxy (settings say 6000 but
# automaticallyFindPort may shift it; the process args carry the resolved port).
# ponytail: -ww or BSD ps truncates args to terminal width and eats the flags below
PROC="$(ps -Awwo args= | grep '[k]6-studio-proxy' | head -1 || true)"
if [ -z "$PROC" ]; then
  echo "k6 Studio proxy not running - start the app first." >&2
  exit 1
fi
PORT="$(printf '%s' "$PROC" | sed -n 's/.*--listen-port \([0-9][0-9]*\).*/\1/p')"

# Cert dir comes off the same process, so dev build and installed app both work
# (they use different CAs - picking the wrong one breaks TLS).
CONFDIR="$(printf '%s' "$PROC" | sed -n 's/.*--set confdir=\([^ ]*\).*/\1/p')"
CERT="$CONFDIR/mitmproxy-ca-cert.pem"
SPKI="$(openssl x509 -in "$CERT" -pubkey -noout \
  | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64)"

# ponytail: throwaway profile each run, so no cookie bleed from your real Chrome
PROFILE="$(mktemp -d /tmp/k6-agent-chrome-XXXX)"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PROFILE" \
  --proxy-server="http://localhost:$PORT" \
  --ignore-certificate-errors-spki-list="$SPKI" \
  --remote-debugging-port="$CDP_PORT" \
  --no-first-run --no-default-browser-check --hide-crash-restore-bubble \
  --disable-background-networking --disable-component-update --disable-sync \
  "$URL" &

echo "proxy :$PORT  cdp :$CDP_PORT  profile $PROFILE"
