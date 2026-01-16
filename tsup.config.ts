import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server-http.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
});
