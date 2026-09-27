import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Clean the generated code only. `styles.css` and the icon font live in `dist` too (copied by `npm run build`); wiping them
  // would leave a dev server that links this package unable to resolve `@agentivity-labs/sdk-react/styles.css` mid-build.
  clean: ['dist/**/*.{js,cjs,map,d.ts,d.cts}'],
  target: 'es2022',
  external: ['react'],
});
