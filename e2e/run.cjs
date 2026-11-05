// Gera o build de produção, serve com os cabeçalhos da Vercel/Netlify e roda o teste no Chromium.
//   node e2e/run.cjs prod      → modo local (dados no navegador)       — npm run test:e2e
//   node e2e/run.cjs supabase  → modo Supabase com servidor simulado    — npm run test:supabase
const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');

const MODES = {
  prod: { out: 'dist-e2e', port: 4173, test: 'e2e/smoke.cjs', env: { VITE_DATA_MODE: 'local' } },
  supabase: { out: 'dist-supabase-teste', port: 4174, test: 'e2e/supabase-mode.cjs',
    env: { VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: 'https://teste.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste', VITE_ALLOW_SIGNUP: '' } },
};
const mode = MODES[process.argv[2] || 'prod'];
if (!mode) { console.error('Use: node e2e/run.cjs prod|supabase'); process.exit(2); }
const root = path.resolve(__dirname, '..');
const env = { ...process.env, ...mode.env }; // variáveis do processo têm prioridade sobre .env.local

const build = spawnSync('npx', ['vite', 'build', '--outDir', mode.out, '--emptyOutDir'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath, [path.join(__dirname, 'serve-dist.cjs'), String(mode.port)], { cwd: root, env: { ...env, DIST_DIR: mode.out }, stdio: 'inherit' });
setTimeout(() => {
  const t = spawn(process.execPath, [path.join(root, mode.test), `http://localhost:${mode.port}`], { cwd: root, stdio: 'inherit' });
  t.on('exit', (code) => { server.kill(); process.exit(code ?? 1); });
}, 800);
