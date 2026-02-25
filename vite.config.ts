import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { inspectAttr } from 'kimi-plugin-inspect-react';
import { VitePWA } from 'vite-plugin-pwa'; // 👈 新增导入

// https://vite.dev/config/
export default defineConfig({
  base: './', // ✅ 保持相对路径
  plugins: [
    inspectAttr(),
    react(),
    // 👇 新增：PWA 插件
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false, // 开发环境不启用 SW
      },
      manifest: {
        name: '我的知识库',
        short_name: '知识库',
        description: '个人书籍和文献管理工具',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './', // 注意：用 ./ 而不是 /
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
        // 缓存所有静态资源，包括你的章节数据（如 .json）
        globPatterns: ['**/*.{js,css,html,png,svg,json,txt}'],
        // 如果你的书籍是 .md 或其他格式，也加上，例如：
        // globPatterns: ['**/*.{js,css,html,png,svg,json,md,txt}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 最大缓存 5MB 的文件
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
  },
});