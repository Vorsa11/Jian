import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourname.knowledgebase',
  appName: '我的知识库',
  webDir: 'docs',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
      // 删除 overlaysWebView 或设为 false，因为完全隐藏不需要覆盖效果
      // overlaysWebView: false,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
    }
  }
};

export default config;