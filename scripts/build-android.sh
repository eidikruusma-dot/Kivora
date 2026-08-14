#!/usr/bin/env bash
# build-android.sh — rebuild Kivora Android APK + AAB
#
# Run from the workspace root:
#   bash scripts/build-android.sh
#
# Prerequisites (already installed in this Replit):
#   - OpenJDK 21   at /nix/store/k95pqfzyvrna93hc9a4cg5csl7l4fh0d-openjdk-21.0.7+6
#   - Android SDK  at /home/runner/android-sdk
#   - Capacitor    installed in artifacts/planner-app

set -e

# ── Signing secret check ────────────────────────────────────────────────────
if [ -z "${KIVORA_KEYSTORE_PASSWORD:-}" ]; then
  echo "ERROR: KIVORA_KEYSTORE_PASSWORD is not set." >&2
  echo "Set it as a Replit Secret before running this script." >&2
  exit 1
fi

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_HOME=/home/runner/android-sdk
JAVA_HOME=/nix/store/k95pqfzyvrna93hc9a4cg5csl7l4fh0d-openjdk-21.0.7+6
export ANDROID_HOME JAVA_HOME
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "=== Step 1: Build web assets for Android ==="
cd "$WORKSPACE_ROOT/artifacts/planner-app"
pnpm run build:android

echo ""
echo "=== Step 2: Sync Capacitor ==="
npx cap sync android

echo ""
echo "=== Step 3: Gradle assembleRelease + bundleRelease ==="
cd android
./gradlew assembleRelease bundleRelease --no-daemon

echo ""
echo "=== Step 4: Copy outputs ==="
cd "$WORKSPACE_ROOT"
mkdir -p build-output
cp artifacts/planner-app/android/app/build/outputs/apk/release/app-release.apk   build-output/kivora-1.0.apk
cp artifacts/planner-app/android/app/build/outputs/bundle/release/app-release.aab build-output/kivora-1.0.aab

echo ""
echo "Done!"
ls -lh build-output/
