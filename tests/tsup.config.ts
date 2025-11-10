import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'], // <--- This is the key change: output ES modules
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});