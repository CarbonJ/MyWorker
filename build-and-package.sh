#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build-and-package.sh
# Builds MyWorker and zips the dist/ folder ready to copy to another machine.
# Run from the project root: ./build-and-package.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

DIST_DIR="dist"

# ── Prompt for version number ─────────────────────────────────────────────────
read -rp "Version number (e.g. 1.3.0): " VERSION
if [[ -z "$VERSION" ]]; then
  echo "❌ No version entered. Aborting."
  exit 1
fi
OUTPUT_ZIP="myworker-app-v${VERSION}.zip"

echo "▶ Building MyWorker..."
npm run build

echo "▶ Copying launcher scripts into dist/..."
cp launch-myworker.bat     "$DIST_DIR/launch-myworker.bat"
cp launch-myworker.sh      "$DIST_DIR/launch-myworker.sh"
cp launch-myworker.command "$DIST_DIR/launch-myworker.command"

# Ensure shell scripts are executable inside the zip (-X preserves Unix permissions)
chmod +x "$DIST_DIR/launch-myworker.sh"
chmod +x "$DIST_DIR/launch-myworker.command"

echo "▶ Creating $OUTPUT_ZIP..."
rm -f "$OUTPUT_ZIP"
cd "$DIST_DIR"
zip -rX "../$OUTPUT_ZIP" .
cd ..

echo ""
echo "✅ Done!  →  $OUTPUT_ZIP"
echo ""
echo "On the target machine:"
echo "  Windows  — unzip, double-click launch-myworker.bat"
echo "  macOS    — unzip, double-click launch-myworker.command"
echo "  Linux    — unzip, run: chmod +x launch-myworker.sh && ./launch-myworker.sh"
echo ""
echo "All platforms: open Chrome at http://localhost:3000"
