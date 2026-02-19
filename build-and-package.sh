#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build-and-package.sh
# Builds MyWorker and zips the dist/ folder ready to copy to another machine.
# Run from the project root: ./build-and-package.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

DIST_DIR="dist"
LAUNCHER="launch-myworker.bat"
OUTPUT_ZIP="myworker-app.zip"

echo "▶ Building MyWorker..."
npm run build

echo "▶ Copying launcher script into dist/..."
cp "$LAUNCHER" "$DIST_DIR/$LAUNCHER"

echo "▶ Creating $OUTPUT_ZIP..."
# Remove old zip if present
rm -f "$OUTPUT_ZIP"
cd "$DIST_DIR"
zip -r "../$OUTPUT_ZIP" .
cd ..

echo ""
echo "✅ Done!  →  $OUTPUT_ZIP"
echo ""
echo "On the target machine:"
echo "  1. Unzip myworker-app.zip into any folder"
echo "  2. Double-click launch-myworker.bat"
echo "  3. Open Chrome and go to http://localhost:3000"
