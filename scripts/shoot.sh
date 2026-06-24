#!/usr/bin/env sh
# SPDX-License-Identifier: Apache-2.0
# Screenshot the built dashboard via headless Chromium against a local static server.
# Dev tooling only (not used by CI). Usage: scripts/shoot.sh [out.png] [path-with-query]
set -eu
OUT="${1:-/tmp/meshint.png}"
PAGE="${2:-}"
PORT=8765

zola build >/dev/null

python3 -m http.server "$PORT" --directory public >/tmp/mc-http.log 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT

# wait for the server (python time.sleep, not the shell builtin)
python3 -c "
import socket, time, sys
for _ in range(100):
    try:
        socket.create_connection(('127.0.0.1', $PORT), 0.2).close(); sys.exit(0)
    except OSError:
        time.sleep(0.1)
sys.exit(1)
"

CHROME=""
for c in chromium chromium-browser google-chrome google-chrome-stable chrome; do
  if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
done
if [ -z "$CHROME" ]; then
  echo "shoot: no Chromium/Chrome found — open http://127.0.0.1:$PORT/$PAGE manually" >&2
  exit 3
fi

"$CHROME" --headless=new --no-sandbox --hide-scrollbars --disable-gpu \
  --window-size=1600,1000 --virtual-time-budget=9000 \
  --screenshot="$OUT" "http://127.0.0.1:$PORT/$PAGE" >/tmp/mc-chrome.log 2>&1 || {
  echo "shoot: chromium failed; see /tmp/mc-chrome.log" >&2
  exit 4
}
echo "shoot: wrote $OUT"
