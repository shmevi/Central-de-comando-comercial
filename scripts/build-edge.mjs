// Gera o bundle da Edge Function notion-sync: um único arquivo ESM, sem imports externos,
// com o alias "@" do projeto resolvido. Saída: supabase/functions/notion-sync/dist/index.js (fora do git).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fn = path.join(root, 'supabase/functions/notion-sync');

await build({
  entryPoints: [path.join(fn, 'index.ts')],
  outfile: path.join(fn, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  alias: { '@': path.join(root, 'src') },
  resolveExtensions: ['.ts', '.js'],
  legalComments: 'none',
  logLevel: 'info',
});
