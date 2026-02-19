#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# launch-myworker.sh
# Starts MyWorker on http://localhost:3000 using Python's built-in web server.
#
# macOS:  ./launch-myworker.sh   (or double-click launch-myworker.command)
# Linux:  ./launch-myworker.sh
#
# Close this terminal window / press Ctrl-C to stop the server.
# ─────────────────────────────────────────────────────────────────────────────

# Change to the directory this script lives in (so Python serves the right files)
cd "$(cd "$(dirname "$0")" && pwd)"

echo ""
echo " Starting MyWorker..."
echo " Address: http://localhost:3000"
echo " Press Ctrl-C to stop the server."
echo ""

# Open the browser after a 1-second delay (runs in background)
(
  sleep 1
  if command -v open &>/dev/null; then
    # macOS
    open "http://localhost:3000"
  elif command -v xdg-open &>/dev/null; then
    # Linux with a desktop environment
    xdg-open "http://localhost:3000"
  fi
) &

# Start the Python web server (blocking)
python3 -m http.server 3000 2>/dev/null || python -m http.server 3000
