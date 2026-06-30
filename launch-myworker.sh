#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# launch-myworker.sh
# Starts MyWorker on http://localhost:3000.
#
# macOS:  ./launch-myworker.sh   (or double-click launch-myworker.command)
# Linux:  ./launch-myworker.sh
#
# Close this terminal window / press Ctrl-C to stop the server.
# ─────────────────────────────────────────────────────────────────────────────

# Resolve the directory this script lives in.
# When run from the project root the script serves ./dist/ (the built app).
# When run from inside a zip extract (where the script sits next to index.html)
# it serves ./ directly.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/dist/index.html" ]; then
  # Script is at the project root — serve the dist subfolder
  SERVE_DIR="$SCRIPT_DIR/dist"
elif [ -f "$SCRIPT_DIR/index.html" ]; then
  # Script is alongside the built files (e.g. extracted from zip)
  SERVE_DIR="$SCRIPT_DIR"
else
  echo "ERROR: Cannot find index.html in $SCRIPT_DIR or $SCRIPT_DIR/dist"
  echo "Run 'npm run build' first, or use the zip package."
  exit 1
fi

cd "$SERVE_DIR"

echo ""
echo " Starting MyWorker..."
echo " Address: http://localhost:3000"
echo " Serving: $SERVE_DIR"
echo " Press Ctrl-C to stop the server."
echo ""

# Open the browser after a 1-second delay (runs in background)
(
  sleep 1
  if command -v open &>/dev/null; then
    open "http://localhost:3000"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000"
  fi
) &

# ── Server selection ──────────────────────────────────────────────────────────
# Python's http.server does not serve .wasm files with the correct
# Content-Type (application/wasm), which causes Safari to refuse to run them.
# We prefer npx serve (correct MIME types), falling back to a Python wrapper
# that adds the missing header.

if command -v npx &>/dev/null; then
  npx --yes serve -l 3000 -s .

elif command -v python3 &>/dev/null; then
  python3 - <<'PYEOF'
import http.server

class WasmHandler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if str(path).endswith('.wasm'):
            return 'application/wasm'
        return super().guess_type(path)
    def log_message(self, *args):
        pass

http.server.test(HandlerClass=WasmHandler, port=3000, bind='127.0.0.1')
PYEOF

else
  python -m http.server 3000
fi
