import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kivora.app',
  appName: 'Kivora',
  webDir: 'dist/android',
  server: {
    // Use https scheme so Firebase Auth cookies and service-worker
    // behave the same as on the web (http would be treated as mixed-content).
    androidScheme: 'https',
  },
  android: {
    // Keystore lives at android/app/kivora-release.keystore
    // Signing is configured directly in android/app/build.gradle
  },
  plugins: {
    GoogleAuth: {
      // Web Client ID from Firebase Console → Authentication → Sign-in method
      // → Google → Web SDK configuration → Web client ID.
      // Must match the oauth_client entry (client_type: 3) in google-services.json.
      // Replace this placeholder before running cap sync / building the APK.
      serverClientId: 'REPLACE_WITH_FIREBASE_WEB_CLIENT_ID.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      forceCodeForRefreshToken: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#F4F3EF',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'Light',
      backgroundColor: '#F4F3EF',
    },
  },
}

export default config
