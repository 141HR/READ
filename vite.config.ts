import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages 部署在 https://<user>.github.io/READ/ 子路径下；本地开发与 Android 打包仍用根路径
  base: process.env.CI ? '/READ/' : '/',
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
});
