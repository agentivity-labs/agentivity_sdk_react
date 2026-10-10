// Builds the standalone graph: one script (React and the styles inside) and the icon font next to it, for pages that are not React.
//   node scripts/build-standalone.mjs      ->  dist/standalone/agentivity-graph.js, dist/standalone/material-icons.woff2
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'standalone');
fs.mkdirSync(out, { recursive: true });

// `import x from 'file?raw'` gives the text of the file (the suffix Vite uses in the tests).
const rawText = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')), namespace: 'raw-text' }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, (args) => ({ contents: `export default ${JSON.stringify(fs.readFileSync(args.path, 'utf8'))};`, loader: 'js' }));
  },
};

await build({
  entryPoints: [path.join(root, 'src', 'standalone', 'agentivity-graph.tsx')],
  outfile: path.join(out, 'agentivity-graph.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  plugins: [rawText],
  banner: { js: '/* Agentivity graph, <agentivity-graph> - @agentivity-labs/sdk-react, MIT. Keep material-icons.woff2 next to this file. */' },
  logLevel: 'info',
});
fs.copyFileSync(path.join(root, 'src', 'icons', 'material-icons.woff2'), path.join(out, 'material-icons.woff2'));
fs.copyFileSync(path.join(root, 'src', 'icons', 'LICENSE-material-icons.txt'), path.join(out, 'LICENSE-material-icons.txt'));
console.log(`standalone graph written to ${path.relative(root, out)}`);
