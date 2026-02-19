#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# launch-myworker.command
# macOS Finder double-click launcher — opens Terminal and starts MyWorker.
#
# Double-click this file in Finder. Terminal will open and the app will start.
# ─────────────────────────────────────────────────────────────────────────────

# Run launch-myworker.sh from the same directory as this file
DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$DIR/launch-myworker.sh"
