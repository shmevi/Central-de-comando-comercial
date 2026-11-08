// Teste do app em MODO SUPABASE, no navegador, sem projeto real:
// as chamadas para https://teste.supabase.co são interceptadas e respondidas por um Supabase simulado
// (Auth + PostgREST em memória, com user_id e RLS simulados).
// Uso: npm run test:supabase   (gera o build em dist-supabase-teste e roda este arquivo)
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:4174';
const SB = 'https://teste.supabase.co';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++; };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USERS = { 'coord@cppem.com.br': { id: '11111111-1111-4111-8111-111111111111', password: 'Senha123' }, 'outra@cppem.com.br': { id: '22222222-2222-4222-8222-222222222222', password: 'Senha456' } };
const tokenFor = (email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USERS[email].id, email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.assinatura`;
const session = (email) => ({ access_token: tokenFor(email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + email,
  user: { id: USERS[email].id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });

/** PostgREST em memória: cada linha guarda user_id; o "RLS" filtra pelo usuário do token. */
const db = {}; const calls = []; const storage = new Map();
function userFromAuth(h) { try { return JSON.parse(Buffer.from(h.split(' ')[1].split('.')[1], 'base64url').toString()).sub; } catch { return null; } }
async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const method = req.method();
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  calls.push(`${method} ${url.pathname}`);
  if (url.pathname === '/auth/v1/token') {
    const { email, password } = JSON.parse(req.postData() || '{}');
    if (USERS[email]?.password === password) return json(200, session(email));
    return json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  }
  if (url.pathname === '/auth/v1/recover') return json(200, {});
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
  if (url.pathname === '/auth/v1/user') return json(200, session('coord@cppem.com.br').user);
  // Storage simulado (bucket privado "branding"): cada usuário só lê/grava na própria pasta <user_id>/...
  const st = /^\/storage\/v1\/object\/branding\/?(.*)$/.exec(url.pathname);
  if (st) {
    const uidS = userFromAuth(req.headers()['authorization'] || '');
    if (!uidS) return json(400, { statusCode: '403', error: 'Unauthorized', message: 'JWT required' });
    const path = decodeURIComponent(st[1]);
    if (method === 'DELETE') {
      const { prefixes = [] } = JSON.parse(req.postData() || '{}');
      const removed = prefixes.filter((x) => x.startsWith(uidS + '/') && storage.delete(x));
      return json(200, removed.map((name) => ({ name })));
    }
    if (!path.startsWith(uidS + '/')) return json(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (method === 'POST' || method === 'PUT') { storage.set(path, req.postDataBuffer()); return json(200, { Key: `branding/${path}` }); }
    if (method === 'GET') { const buf = storage.get(path); return buf ? route.fulfill({ status: 200, contentType: 'image/png', body: buf }) : json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }); }
  }
  const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (!m) return json(404, { message: 'not found' });
  const uid = userFromAuth(req.headers()['authorization'] || '');
  if (!uid) return json(401, { code: 'PGRST301', message: 'JWT required' });
  const table = (db[m[1]] ||= []);
  const mine = table.filter((r) => r.user_id === uid);
  if (method === 'GET') {
    const off = Number(url.searchParams.get('offset') || 0), lim = Number(url.searchParams.get('limit') || 1000);
    return json(200, mine.slice(off, off + lim));
  }
  if (method === 'POST') {
    const body = JSON.parse(req.postData()); const rows = Array.isArray(body) ? body : [body];
    if (rows.some((r) => 'user_id' in r)) return json(403, { code: '42501', message: 'user_id não deve ser enviado' });
    if (m[1] === 'settings' && mine.length) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
    const now = new Date().toISOString();
    const created = rows.map((r) => ({ id: r.id || crypto.randomUUID(), created_at: now, updated_at: now, user_id: uid, ...r }));
    table.push(...created);
    return json(201, Array.isArray(body) ? created : created[0]);
  }
  const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
  const row = mine.find((r) => r.id === id);
  if (method === 'PATCH') { if (!row) return json(406, { code: 'PGRST116', message: '0 rows' }); Object.assign(row, JSON.parse(req.postData()), { updated_at: new Date().toISOString() }); return json(200, row); }
  if (method === 'DELETE') { if (row) table.splice(table.indexOf(row), 1); return route.fulfill({ status: 204 }); }
  return json(405, {});
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(`${SB}/**`, handle);
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/400|Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await p.goto(BASE); await p.waitForSelector('text=Entre para continuar');
  ok(await p.locator('text=Criar conta').count() === 0, 'cadastro público escondido (VITE_ALLOW_SIGNUP vazio)');

  await p.fill('input[type=email]', 'coord@cppem.com.br'); await p.fill('input[type=password]', 'errada1');
  await p.click('button:has-text("Entrar")');
  ok(await p.locator('text=E-mail ou senha inválidos.').waitFor({ timeout: 5000 }).then(() => true, () => false), 'senha errada mostra mensagem em português');

  await p.click('text=Esqueci minha senha');
  await p.click('button:has-text("Enviar link")');
  ok(await p.locator('text=você receberá um link').waitFor({ timeout: 5000 }).then(() => true, () => false), '"Esqueci minha senha" envia o pedido de recuperação');
  ok(calls.includes('POST /auth/v1/recover'), 'chamada /auth/v1/recover feita ao Supabase');
  await p.click('text=Voltar para “Entrar”');

  await p.fill('input[type=password]', 'Senha123'); await p.click('button:has-text("Entrar")');
  await p.waitForSelector('text=Missão do dia', { timeout: 10000 });
  ok(true, 'login com senha certa abre a central');
  ok(await p.locator('text=Persistência: Supabase').count() + await p.locator('text=Supabase').count() > 0, 'app indica que está usando o Supabase');
  ok((db.institutions || []).length === 3 && (db.settings || []).length === 1 && (db.tasks || []).length === 3, 'primeiro acesso cria instituições, configurações e as 3 tarefas no banco');
  ok((db.tasks || []).every((t) => t.user_id === USERS['coord@cppem.com.br'].id), 'registros gravados com o user_id do usuário logado (definido pelo banco)');

  // criar e recarregar: dados vêm do banco
  await p.goto(BASE + '/tarefas'); await p.click('button:has-text("Nova tarefa")');
  await p.fill('role=dialog >> label:has-text("Título") >> xpath=following-sibling::input', 'Tarefa no Supabase');
  await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForSelector('text=Tarefa no Supabase');
  await p.reload(); await p.waitForSelector('text=Tarefa no Supabase', { timeout: 10000 });
  ok((db.tasks || []).some((t) => t.title === 'Tarefa no Supabase'), 'tarefa criada fica no banco e reaparece após recarregar');

  // Logo personalizada no Storage: pasta do usuário, caminho salvo em settings.logo_path, persiste após recarregar
  await p.goto(BASE + '/configuracoes'); await p.waitForSelector('text=Identidade visual');
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('input[aria-label="Arquivo da logo"]', { name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('text=Logo personalizada em uso.', { timeout: 8000 });
  const uidA = USERS['coord@cppem.com.br'].id;
  const logoPath = (db.settings || []).find((x) => x.user_id === uidA)?.logo_path || '';
  ok(logoPath.startsWith(uidA + '/') && storage.has(logoPath), `logo enviada ao Storage na pasta do usuário (${logoPath})`);
  await p.reload(); await p.waitForSelector('text=Identidade visual');
  ok(await p.locator('aside img[alt="Logo da Central"]').waitFor({ timeout: 8000 }).then(() => true, () => false), 'logo baixada do Storage após recarregar (persistência entre sessões)');

  // Conquista do relatório gravada no banco (report_entries) com o user_id do usuário
  await p.goto(BASE + '/relatorios'); await p.waitForSelector('text=Tarefas concluídas');
  await p.fill('#entrada-conquista', 'Conquista no Supabase'); await p.click('button[aria-label="Registrar conquista"]');
  await p.waitForSelector('li:has-text("Conquista no Supabase")');
  ok((db.report_entries || []).some((e) => e.text === 'Conquista no Supabase' && e.user_id === uidA && e.kind === 'conquista'), 'conquista salva em report_entries no Supabase');

  // sessão persiste entre recargas; sair volta para o login
  await p.click('button:has-text("Sair")'); await p.waitForSelector('text=Entre para continuar');
  ok(true, 'sair volta para a tela de login');

  // outro usuário não vê os dados do primeiro
  await p.fill('input[type=email]', 'outra@cppem.com.br'); await p.fill('input[type=password]', 'Senha456'); await p.click('button:has-text("Entrar")');
  await p.waitForSelector('text=Missão do dia', { timeout: 10000 });
  await p.goto(BASE + '/tarefas'); await p.waitForTimeout(800);
  ok(await p.locator('text=Tarefa no Supabase').count() === 0, 'segundo usuário não vê tarefas do primeiro');
  ok(await p.locator('aside img[alt="Logo da Central"]').count() === 0, 'segundo usuário não herda a logo do primeiro');
  await p.goto(BASE + '/relatorios'); await p.waitForSelector('text=Tarefas concluídas');
  ok(await p.locator('text=Conquista no Supabase').count() === 0, 'segundo usuário não vê conquistas do primeiro');

  // link de recuperação de senha do e-mail → tela "Defina sua senha" → app
  await p.click('button:has-text("Sair")'); await p.waitForSelector('text=Entre para continuar');
  const s1 = session('coord@cppem.com.br');
  await p.goto(`${BASE}/#access_token=${s1.access_token}&refresh_token=${s1.refresh_token}&expires_in=3600&expires_at=${s1.expires_at}&token_type=bearer&type=recovery`);
  ok(await p.locator('text=Defina sua senha').waitFor({ timeout: 8000 }).then(() => true, () => false), 'link de recuperação abre a tela "Defina sua senha"');
  await p.fill('label:has-text("Nova senha") >> xpath=following-sibling::input', 'curta');
  await p.click('button:has-text("Salvar senha e entrar")');
  ok(await p.locator('text=ao menos 8 caracteres').isVisible(), 'senha fraca é recusada');
  await p.fill('label:has-text("Nova senha") >> xpath=following-sibling::input', 'NovaSenha2026');
  await p.fill('label:has-text("Repita a nova senha") >> xpath=following-sibling::input', 'NovaSenha2026');
  await p.click('button:has-text("Salvar senha e entrar")');
  await p.waitForSelector('text=Missão do dia', { timeout: 10000 });
  ok(calls.includes('PUT /auth/v1/user'), 'nova senha enviada ao Supabase (updateUser) e app liberado');

  ok(errors.length === 0, `sem erros no console nem violações de CSP (${errors.slice(0, 3).join(' | ')})`);
  await b.close();
  console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
