import { defineConfig } from 'vite';

const BACKEND_TARGET = 'http://127.0.0.1:3000';
const resolvedBackendTarget = process.env.VITE_BACKEND_TARGET?.trim() || BACKEND_TARGET;

export default defineConfig({
  appType: 'spa',
  server: {
    host: '0.0.0.0',
    port: 5177,
    proxy: {
      '/api': {
        target: resolvedBackendTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
