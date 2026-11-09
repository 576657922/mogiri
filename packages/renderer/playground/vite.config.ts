import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: decodeURIComponent(new URL('.', import.meta.url).pathname),
  plugins: [react()],
  server: { port: 5174, host: true },
  build: { outDir: '../dist-playground', emptyOutDir: true },
});
