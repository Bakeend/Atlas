import type { CapacitorConfig } from '@capacitor/cli'

// Plataforma Android versionada em ./android — sincronize com: npx cap sync android
const config: CapacitorConfig = {
  appId: 'com.atlas.finance',
  appName: 'Atlas',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // permite hot-reload no device em dev, se precisar:
    // url: 'http://192.168.0.10:5173',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#2F80ED' },
    LocalNotifications: { smallIcon: 'ic_stat_icon_config_sample', iconColor: '#2F80ED' },
  },
}

export default config
