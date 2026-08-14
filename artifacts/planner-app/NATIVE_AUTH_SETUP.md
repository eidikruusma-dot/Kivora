# Native Social Auth Setup for Kivora Android

Email/password auth works out of the box.  
Google and Facebook require a one-time credential registration in their
respective consoles. Follow the steps below **once**, then rebuild the APK.

---

## Release keystore

The keystore is at `android/app/kivora-release.keystore` (alias: `kivora`).  
Fingerprints are reported separately and updated in memory after each keystore
rotation. Do not hardcode the keystore password anywhere — it lives only in
the `KIVORA_KEYSTORE_PASSWORD` Replit Secret.

To print the fingerprints at any time:

```bash
keytool -list -v \
  -keystore artifacts/planner-app/android/app/kivora-release.keystore \
  -alias kivora \
  -storepass:env KIVORA_KEYSTORE_PASSWORD
```

To generate the Android key hash required by the Facebook Developer Console:

```bash
keytool -exportcert \
  -alias kivora \
  -keystore artifacts/planner-app/android/app/kivora-release.keystore \
  -storepass:env KIVORA_KEYSTORE_PASSWORD \
  | openssl sha1 -binary | openssl base64
```

---

## Step 1 — Google Sign-In

### 1a. Register the Android app in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com) → your project → **Project Settings** (gear icon).
2. Under **Your apps**, click **Add app → Android**.
3. Enter:
   - **Android package name**: `com.kivora.app`
   - **App nickname**: Kivora Android (optional)
   - **Debug signing certificate SHA-1**: see fingerprints reported in memory / chat.
4. Click **Register app** and **download `google-services.json`**.
5. Place the downloaded file at:
   ```
   artifacts/planner-app/android/app/google-services.json
   ```

### 1b. Enable Google Sign-In in Firebase Auth

1. Firebase Console → **Authentication** → **Sign-in method** → **Google** → **Enable**.
2. Copy the **Web client ID** shown under "Web SDK configuration" — it looks like  
   `123456789-abc….apps.googleusercontent.com`.

### 1c. Set the Web Client ID in Capacitor config

Open `artifacts/planner-app/capacitor.config.ts` and replace the placeholder:

```ts
GoogleAuth: {
  serverClientId: 'REPLACE_WITH_FIREBASE_WEB_CLIENT_ID.apps.googleusercontent.com',
  ...
}
```

---

## Step 2 — Facebook Login

### 2a. Create / locate your Facebook App

1. Go to [Facebook for Developers](https://developers.facebook.com) → **My Apps**.
2. Select your existing app (the one used by the web version of Kivora) **or** create a new one.

### 2b. Add Android platform

1. App → **Settings → Basic → Add Platform → Android**.
2. Fill in:
   - **Google Play Package Name**: `com.kivora.app`
   - **Class Name**: `com.kivora.app.MainActivity`
   - **Key Hashes**: run the key-hash command above and paste the result.

### 2c. Copy credentials into strings.xml

Open `artifacts/planner-app/android/app/src/main/res/values/strings.xml` and
replace the three placeholders:

| Placeholder | Where to find it |
|---|---|
| `REPLACE_WITH_FACEBOOK_APP_ID` | Settings → Basic → **App ID** |
| `REPLACE_WITH_FACEBOOK_CLIENT_TOKEN` | Settings → Advanced → **Client Token** |
| `fbREPLACE_WITH_FACEBOOK_APP_ID` | prefix "fb" + App ID, e.g. `fb1234567890` |

### 2d. Enable Facebook Login product

App → **Products** → **Facebook Login** → **Settings**:
- **Valid OAuth Redirect URIs**: add `https://kivora.ee`
- Save changes.

---

## Step 3 — Rebuild the APK

The `KIVORA_KEYSTORE_PASSWORD` Replit Secret must be set before building.

```bash
bash scripts/build-android.sh
```

Or step by step:

```bash
cd artifacts/planner-app
pnpm build:android
npx cap sync android
cd android
./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../../../build-output/kivora-1.0.apk
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Gradle: "storePassword is empty" | `KIVORA_KEYSTORE_PASSWORD` Replit Secret not set |
| Google: "Sign-in failed" / error 10 | SHA-1 not registered in Firebase Console, or `serverClientId` in `capacitor.config.ts` is still the placeholder |
| Google: "Sign-in failed" / error 12500 | `google-services.json` not placed in `android/app/`, or wrong package name registered |
| Facebook: "Invalid key hash" | Key hash not added in Facebook Developer Console → Settings → Basic → Android |
| Facebook: "App not set up" | Facebook Login product not added/activated for the app |
| Firebase: "auth/account-exists-with-different-credential" | User previously signed in with a different provider using the same email — expected Firebase behaviour |
