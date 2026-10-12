import { build } from 'vite';

// Rollup handles CommonJS dependencies without esbuild scanning ancestor directories.
// The generated module stays in node_modules and is rebuilt when starting dev.
await build({
  configFile: false,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  build: {
    lib: { entry: 'scripts/dev-dependencies.js', formats: ['es'], fileName: () => 'dependencies.js' },
    outDir: 'node_modules/.lokinvas',
    emptyOutDir: true,
    minify: false,
  },
});
