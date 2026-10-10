import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

// 与 server 的 config.ts 对齐：根目录 .env 的 PORT 决定后端端口
const env = loadEnv('', resolve(__dirname, '../..'), '');
const apiPort = env.PORT || '8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
});
