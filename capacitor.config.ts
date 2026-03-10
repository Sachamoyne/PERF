/// <reference types="@capacitor/cli" />

/**
 * Capacitor configuration — ready for `npx cap init && npx cap add ios`
 *
 * After cloning from GitHub:
 *   1. npm install
 *   2. npm run build
 *   3. npx cap init "Athletes Ascent" "com.athletesascent.app" --web-dir dist
 *   4. npx cap add ios
 *   5. npx cap open ios
 *
 * Then in Xcode:
 *   - Enable HealthKit capability
 *   - Add Info.plist keys (see src/services/health.ts)
 */
const config = {
  appId: "com.athletesascent.app",
  appName: "Athletes Ascent",
  webDir: "dist",
  server: {
    // During dev, uncomment and set to your local IP:
    // url: "http://192.168.1.X:5173",
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
