import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 关键：APK 用相对路径 './'，GitHub Pages 用 '/Jian/'
  base: mode === 'apk' ? './' : '/Jian/',
  
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: '我的知识库',
        short_name: '知识库',
        description: '个人书籍和文献管理工具',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        // 关键：根据模式设置不同的 start_url 和 scope
        start_url: mode === 'apk' ? './' : '/Jian/',
        scope: mode === 'apk' ? './' : '/Jian/',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,txt}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'docs',
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html')
    }
  },
  // 👇 新增：防止 Vite 误扫描未使用的依赖
  optimizeDeps: {
    exclude: ['react-window', 'react-virtualized-auto-sizer'],
  },
}));