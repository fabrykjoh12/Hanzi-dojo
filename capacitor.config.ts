import type { CapacitorConfig } from '@capacitor/cli'

// Native shell config only — never imported by the web app itself (src/ has
// no reference to this file), so it doesn't affect the Vercel build output.
//
// Orientation lock: Capacitor's config has no cross-platform "orientation"
// field (that's a Cordova-era config.xml preference). Once `npx cap add
// ios`/`android` scaffolds the native projects, portrait is locked natively
// to match public/manifest.webmanifest's "orientation": "portrait":
//   - iOS:     ios/App/App/Info.plist → UISupportedInterfaceOrientations
//              (Portrait only, no Upside Down / Landscape entries)
//   - Android: android/app/src/main/AndroidManifest.xml →
//              android:screenOrientation="portrait" on the launcher Activity
const config: CapacitorConfig = {
  appId: 'com.hanzidojo.app',
  appName: 'Hanzi Dojo',
  webDir: 'dist/client',
}

export default config
