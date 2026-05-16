import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_TARGET = 'http://127.0.0.1:3000';
const resolvedBackendTarget = process.env.VITE_BACKEND_TARGET?.trim() || BACKEND_TARGET;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5176,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: resolvedBackendTarget,
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: resolvedBackendTarget,
        changeOrigin: true,
      },
    },
  },
});
