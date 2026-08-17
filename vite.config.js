import { defineConfig } from 'vite';

// Override for forks with: VITE_BASE_PATH=/your-repository/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/Summit-Challenge/',
  build: { target: 'es2020' },
  test: { environment: 'node' },
});
