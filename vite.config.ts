import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { inspectAttr } from 'kimi-plugin-inspect-react';
import { VitePWA } from 'vite-plugin-pwa';

// 你的 GitHub Pages 站点地址是：
// https://vorsa11.github.io/Jian/
// 所以 base 必须是 /Jian/
const BASE_PATH = '/Jian/';

export default defineConfig({
  base: BASE_PATH, // ✅ 关键修改：从 './' 改为 '/Jian/'
  plugins: [
    inspectAttr(),
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
        start_url: BASE_PATH, // ✅ 从 './' 改为 '/Jian/'
        scope: BASE_PATH,     // ✅ 显式指定作用域（可选但推荐）
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
    outDir: 'docs', // ✅ 保持不变
  },
});