import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.braintrip.traveltrivia',
  appName: 'BrainTrip',
  webDir: 'dist/public',
  plugins: {
    StatusBar: {
      overlaysWebView: false,
    },
  },
};

export default config;
