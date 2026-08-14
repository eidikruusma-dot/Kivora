---
name: Android packaging (Capacitor)
description: How Kivora is packaged for Android — Capacitor setup, JDK requirements, SDK paths, signing, and rebuild script.
---

# Android packaging (Capacitor)

## Setup
- Capacitor 8.5 added to `artifacts/planner-app`
- `capacitor.config.ts` at `artifacts/planner-app/capacitor.config.ts`
- Android project at `artifacts/planner-app/android/`
- App ID: `com.kivora.app`, name: Kivora

## Build config
- Separate Vite config: `vite.config.android.ts` — uses `base: '/'` and `outDir: dist/android`
- The standard `vite.config.ts` requires `BASE_PATH` env var (Replit-only); Android build uses `build:android` npm script instead

## JDK requirement
- **Must use OpenJDK 21** — Capacitor Android library uses Java 21 source compatibility
- GraalVM (default `java` on PATH) fails with `jlink` incompatibility at Android Gradle Plugin compilation
- OpenJDK 17 fails with `invalid source release: 21`
- OpenJDK 21 path: `/nix/store/k95pqfzyvrna93hc9a4cg5csl7l4fh0d-openjdk-21.0.7+6`
- Set in `android/gradle.properties` via `org.gradle.java.home=<path>`

**Why:** AGP uses `jlink` to build a JDK image; GraalVM's jlink doesn't support `--disable-plugin system-modules`. And Capacitor's Java sources use language level 21, so JDK 17 can't compile them.

## Android SDK
- Installed at `/home/runner/android-sdk`
- Downloaded from `https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip`
- Components: `platforms;android-36` (auto-pulled by Gradle), `build-tools;35.0.0`, `platform-tools`
- `local.properties` sets `sdk.dir=/home/runner/android-sdk`

## Signing
- Keystore: `artifacts/planner-app/android/app/kivora-release.keystore`
- Alias: `kivora`, passwords: see `scripts/kivora-release.keystore` (same file, copied)
- Signing config in `android/app/build.gradle` under `signingConfigs.release`

## Icons
- Standard launcher icons (mdpi→xxxhdpi) generated from `public/icon-512-maskable.png`
- Adaptive icon foreground generated from `public/icon-512.png` with transparent background
- Background color `#F4F3EF` in `values/ic_launcher_background.xml`

## Rebuild
- Run `bash scripts/build-android.sh` from workspace root
- Outputs: `build-output/kivora-1.0.apk` and `build-output/kivora-1.0.aab`

## Known limitations
- Service Worker inactive in Android WebView (push notifications won't work natively)
- Social sign-in (Google/Facebook) via Firebase redirect may not work in Capacitor WebView without `@capacitor/firebase-authentication`; email/password auth works fine
- Firebase Console must add `https://localhost` as an authorized domain for OAuth to work in the WebView
