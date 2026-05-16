import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  server: {
    host: '0.0.0.0',
    port: 5177,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
