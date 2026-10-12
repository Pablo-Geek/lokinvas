import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => ({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: command === 'serve' ? [{
      find: /^(react|react\/jsx-runtime|react\/jsx-dev-runtime|react-dom\/client|lucide-react)$/,
      replacement: fileURLToPath(new URL('./node_modules/.lokinvas/dependencies.js', import.meta.url)),
    }] : [],
  },
  optimizeDeps: { noDiscovery: true, include: [] },
}));
