// Gera vercel.json e netlify.toml a partir de security-headers.json (uma fonte só, sem divergência).
// Uso: npm run sync:headers   |   Verificação (CI): node scripts/sync-headers.mjs --check
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('security-headers.json', 'utf8'));
const headers = Object.entries(raw).filter(([k]) => k !== '//');
const IMMUTABLE = 'public, max-age=31536000, immutable';

const vercel = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  // SPA: qualquer rota que não seja arquivo existente abre o index.html (ex.: /tarefas)
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  headers: [
    { source: '/(.*)', headers: headers.map(([key, value]) => ({ key, value })) },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: IMMUTABLE }] },
  ],
};

const toml = [
  '# Gerado por scripts/sync-headers.mjs a partir de security-headers.json — não edite à mão.',
  '[build]',
  '  command = "npm run build"',
  '  publish = "dist"',
  '',
  '[build.environment]',
  '  NODE_VERSION = "22"',
  '',
  '# SPA: qualquer rota abre o index.html (ex.: /tarefas)',
  '[[redirects]]',
  '  from = "/*"',
  '  to = "/index.html"',
  '  status = 200',
  '',
  '[[headers]]',
  '  for = "/*"',
  '  [headers.values]',
  ...headers.map(([k, v]) => `    ${k} = ${JSON.stringify(v)}`),
  '',
  '[[headers]]',
  '  for = "/assets/*"',
  '  [headers.values]',
  `    Cache-Control = ${JSON.stringify(IMMUTABLE)}`,
  '',
].join('\n');

const outputs = { 'vercel.json': JSON.stringify(vercel, null, 2) + '\n', 'netlify.toml': toml };
if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([f, c]) => { try { return readFileSync(f, 'utf8') !== c; } catch { return true; } }).map(([f]) => f);
  if (stale.length) { console.error(`Desatualizado: ${stale.join(', ')}. Rode: npm run sync:headers`); process.exit(1); }
  console.log('vercel.json e netlify.toml em dia.');
} else {
  for (const [f, c] of Object.entries(outputs)) writeFileSync(f, c);
  console.log('vercel.json e netlify.toml atualizados.');
}
