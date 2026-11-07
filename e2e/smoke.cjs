// Teste de fumaça E2E: node e2e/smoke.cjs [baseURL]  (requer `npm run dev` ativo)
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5173';
const ROUTES = ['/', '/rotina', '/agenda', '/tarefas', '/recrutamento', '/equipes', '/treinamentos', '/reunioes', '/sistemas', '/okrs', '/projetos', '/relatorios', '/integracoes', '/configuracoes'];
let fails = 0;
const recifeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date());
const isoMinusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
/** Registra o valor do 1º campo (input/textarea) de cada diálogo NO MOMENTO em que ele aparece na tela. */
const watchFirstPaint = (p, sel) => p.evaluate((sel) => {
  window.__firstValues = [];
  const obs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const f = n.querySelector?.(sel); if (f) window.__firstValues.push(f.value); } });
  obs.observe(document.body, { childList: true, subtree: true });
}, sel);
const firstPaint = (p) => p.evaluate(() => window.__firstValues);
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // Qualquer violação da Content-Security-Policy aparece como erro de console e reprova o teste.
  const csp = (await (await fetch(BASE + '/')).headers.get('content-security-policy')) || '';
  console.log(csp ? '• rodando com Content-Security-Policy de produção' : '• rodando sem CSP (servidor de desenvolvimento)');
  await p.goto(BASE); await p.waitForSelector('text=Missão do dia');

  // Dados iniciais
  await p.goto(BASE + '/tarefas'); await p.waitForTimeout(500);
  ok(await p.locator('text=Selecionar candidatos de vendas e agendar entrevistas').count() === 1, 'tarefa inicial 04/11 existe (sem duplicar)');
  ok(await p.locator('text=Realizar entrevistas e registrar decisões').count() === 1, 'tarefa inicial 06/11 existe');

  // Criar tarefa
  await p.click('button:has-text("Nova tarefa")');
  await p.click('role=dialog >> button:has-text("Salvar")');
  ok(await p.locator('text=Informe o título.').isVisible(), 'validação de título obrigatório');
  await p.fill('role=dialog >> label:has-text("Título") >> xpath=following-sibling::input', 'Tarefa E2E');
  await p.click('role=dialog >> button:has-text("Salvar")');
  await p.waitForSelector('text=Tarefa E2E');
  ok(true, 'tarefa criada');

  // Missão do dia: limite de 3
  const stars = p.locator('button[aria-label="Adicionar à missão do dia"]');
  for (let i = 0; i < 4; i++) { await p.locator('button[aria-label="Adicionar à missão do dia"]').first().click(); await p.waitForTimeout(150); }
  ok(await p.locator('button[aria-label="Remover da missão do dia"]').count() === 3, 'missão do dia limitada a 3');
  ok(await p.locator('text=no máximo 3').count() >= 1, 'mensagem de limite exibida');

  // Concluir tarefa
  await p.locator('input[aria-label="Concluir Tarefa E2E"]').check();
  await p.waitForTimeout(200);
  ok(await p.locator('input[aria-label="Reabrir Tarefa E2E"]').count() === 1, 'tarefa concluída');

  // Persistência
  await p.reload(); await p.waitForSelector('text=Tarefa E2E');
  ok(await p.locator('input[aria-label="Reabrir Tarefa E2E"]').isChecked(), 'persistência após recarregar');

  // Abrir para editar: o formulário já aparece com os dados da tarefa (sem piscar valores antigos)
  await watchFirstPaint(p, '[role=dialog] input');
  await p.click('button:has-text("Realizar entrevistas e registrar decisões")');
  await p.locator('role=dialog').waitFor();
  ok((await firstPaint(p))[0] === 'Realizar entrevistas e registrar decisões', `editar tarefa abre já com o título certo (${(await firstPaint(p))[0]})`);
  await p.keyboard.press('Escape');

  // Busca
  await p.fill('#busca', 'E2E'); await p.waitForTimeout(200);
  ok(await p.locator('li:has-text("Tarefa E2E")').count() >= 1 && await p.locator('text=Confirmar entrevistas').count() === 0, 'busca filtra');
  await p.fill('#busca', '');

  // Kanban: mover para "Concluída" grava a conclusão (reaparece como "Reabrir" na lista)
  await p.click('role=radio[name="Kanban"]'); await p.waitForTimeout(200);
  ok(await p.locator('section[aria-label="Em andamento"]').count() === 1, 'kanban renderiza');
  await p.getByRole('combobox', { name: 'Mover Confirmar entrevistas e preparar avaliação para' }).selectOption('concluida');
  await p.waitForTimeout(300);
  await p.click('role=radio[name="Lista"]'); await p.waitForTimeout(200);
  ok(await p.locator('input[aria-label="Reabrir Confirmar entrevistas e preparar avaliação"]').isChecked(), 'kanban → concluída marca a tarefa como concluída');

  // Recorrência: concluir, reabrir e concluir de novo cria UMA próxima ocorrência
  await p.click('button:has-text("Nova tarefa")');
  await p.fill('role=dialog >> label:has-text("Título") >> xpath=following-sibling::input', 'Recorrente E2E');
  await p.fill('role=dialog >> label:has-text("Prazo") >> xpath=following-sibling::input', isoMinusDays(recifeToday(), 10));
  await p.getByRole('dialog').getByRole('combobox', { name: /^Recorrência/ }).selectOption('semanal');
  await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
  for (const label of ['Concluir', 'Reabrir', 'Concluir']) { await p.locator(`input[aria-label="${label} Recorrente E2E"]`).first().click(); await p.waitForTimeout(250); }
  ok(await p.locator('li:has-text("Recorrente E2E")').count() === 2, 'recorrência não duplica ao reabrir e concluir de novo');
  const dues = (await p.locator('li:has-text("Recorrente E2E")').allInnerTexts()).map((t) => /(\d{2})\/(\d{2})\/(\d{4})/.exec(t)).filter(Boolean).map((m) => `${m[3]}-${m[2]}-${m[1]}`);
  ok(dues.some((d) => d > recifeToday()), `tarefa vencida há 10 dias, concluída hoje: próxima ocorrência cai depois de hoje (${dues.join(', ')})`);

  // Recrutamento
  await p.goto(BASE + '/recrutamento'); await p.click('button:has-text("Candidato")');
  await p.fill('role=dialog >> label:has-text("Nome") >> xpath=following-sibling::input', 'Candidato Teste');
  await p.click('role=dialog >> button:has-text("Salvar")');
  ok(await p.locator('text=Escolha a instituição da vaga').isVisible(), 'candidato exige instituição');
  await p.selectOption('role=dialog >> label:has-text("Instituição") >> xpath=following-sibling::select', { label: 'CPPEM' });
  await p.click('role=dialog >> button:has-text("Salvar")');
  await p.waitForSelector('section[aria-label="Recebido"] >> text=Candidato Teste');
  ok(true, 'candidato criado no pipeline');
  await p.click('button[aria-label="Agendar entrevista para Candidato Teste"]');
  await p.fill('role=dialog >> label:has-text("Data") >> xpath=following-sibling::input', '2026-11-06');
  await p.fill('role=dialog >> label:has-text("Início") >> xpath=following-sibling::input', '14:00');
  await p.fill('role=dialog >> label:has-text("Fim") >> xpath=following-sibling::input', '15:00');
  await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
  if (process.env.DEBUG) await p.screenshot({ path: process.env.DEBUG });
  ok(await p.locator('section[aria-label="Entrevista agendada"] >> text=Candidato Teste').count() >= 1, 'agendar move para "Entrevista agendada"');
  // conflito
  await p.getByRole('button', { name: 'Entrevista', exact: true }).click();
  await p.getByRole('dialog').getByRole('combobox', { name: /^Candidato/ }).selectOption({ label: 'Candidato Teste' });
  await p.fill('role=dialog >> label:has-text("Data") >> xpath=following-sibling::input', '2026-11-06');
  await p.fill('role=dialog >> label:has-text("Início") >> xpath=following-sibling::input', '14:30');
  await p.fill('role=dialog >> label:has-text("Fim") >> xpath=following-sibling::input', '15:30');
  ok(await p.locator('role=dialog >> text=Conflito de horário').isVisible(), 'detecção de conflito de entrevistas');
  await p.keyboard.press('Escape');
  await p.click('role=radio[name="Entrevistas"]');
  ok(await p.locator('text=a confirmar').count() >= 1, 'horário não confirmado aparece como "a confirmar"');
  await watchFirstPaint(p, '[role=dialog] textarea');
  await p.click('button[aria-label="Gerar convite para WhatsApp"]');
  await p.locator('role=dialog >> textarea').waitFor();
  ok((await firstPaint(p)).every((v) => v.length > 0), 'convite já aparece preenchido (sem campo vazio no primeiro desenho)');
  const invite = await p.inputValue('role=dialog >> textarea');
  ok(invite.includes('data e horário a confirmar') && !invite.includes('14:00'), 'convite não inventa horário');
  await p.keyboard.press('Escape');

  // Rotina: intervalo protegido
  await p.goto(BASE + '/rotina'); await p.waitForTimeout(400);
  if (await p.locator('button:has-text("Gerar rotina do dia")').count()) await p.click('button:has-text("Gerar rotina do dia")');
  await p.waitForSelector('text=Protegido');
  ok(await p.locator('li:has-text("Intervalo") >> button[aria-label^="Excluir"]').count() === 0, 'intervalo não pode ser excluído');
  await p.click('button:has-text("Bloco")');
  await p.fill('role=dialog >> label:has-text("Título") >> xpath=following-sibling::input', 'Bloco no intervalo');
  await p.fill('role=dialog >> label:has-text("Início") >> xpath=following-sibling::input', '18:10');
  await p.fill('role=dialog >> label:has-text("Fim") >> xpath=following-sibling::input', '18:40');
  await p.click('role=dialog >> button:has-text("Salvar")');
  ok(await p.locator('role=dialog >> text=invade o intervalo').isVisible(), 'bloco no intervalo exige exceção explícita');
  await p.keyboard.press('Escape');

  // Notion mock
  await p.goto(BASE + '/integracoes');
  await p.click('text=Ativar leitura (tarefas e OKRs)');
  await p.click('role=dialog >> button:has-text("Ativar leitura")');
  ok(await p.locator('text=Configuração incompleta').count() === 1, 'sem IDs configurados a sincronização fica bloqueada (fail-closed)');
  ok(await p.locator('button:has-text("Sincronizar")').isDisabled(), 'botão de sincronizar desativado sem configuração');
  await p.click('role=radio[name="Campos"]');
  await p.click('button:has-text("Usar IDs de demonstração")');
  await p.waitForSelector('text=Configuração salva');
  await p.click('role=radio[name="Conexão"]');
  await p.click('button:has-text("Sincronizar")'); await p.waitForSelector('text=Leitura concluída', { timeout: 15000 });
  await p.click('role=radio[name^="Revisão"]');
  ok(await p.locator('text=Status desconhecido: "Backlog"').count() === 1, 'status desconhecido vai para revisão (sem valor padrão)');
  ok(await p.locator('li:has-text("KR sem objetivo") >> text=KR sem Objetivo').count() >= 1, 'KR sem Objetivo vai para revisão (sem Objetivo artificial)');
  ok(await p.locator('text=Tarefa de outra pessoa').count() === 0, 'item de outra pessoa não aparece nem na revisão');
  // Itens pessoais do Notion aparecem mesmo com filtro de instituição
  await p.goto(BASE + '/tarefas');
  await p.selectOption('select[aria-label="Filtrar por instituição"]', { label: 'CPPEM' });
  await p.waitForSelector('text=[Demonstração] Revisar funil de matrículas');
  ok(await p.locator('li:has-text("Revisar funil de matrículas") >> text=Notion').count() === 1, 'tarefa do Notion com selo e visível no filtro CPPEM');
  ok(await p.locator('text=Tarefa de outra pessoa').count() === 0, 'tarefa de outra pessoa não importada');
  await p.selectOption('select[aria-label="Filtrar por instituição"]', 'all');

  // Relatórios: exportar CSV
  await p.goto(BASE + '/relatorios'); await p.waitForSelector('text=Tarefas concluídas');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("CSV")')]);
  ok(dl.suggestedFilename().endsWith('.csv'), 'exporta CSV');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("PDF")')]);
  ok(dl2.suggestedFilename().endsWith('.pdf'), 'exporta PDF');

  // Todas as rotas, desktop + celular, sem rolagem horizontal
  for (const vp of [{ width: 1366, height: 900 }, { width: 360, height: 780 }]) {
    await p.setViewportSize(vp);
    for (const r of ROUTES) {
      await p.goto(BASE + r); await p.waitForTimeout(400);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(sw <= 0, `${vp.width}px ${r} sem rolagem horizontal (${sw})`);
      if (sw > 0) console.log(await p.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach((e) => { const rc = e.getBoundingClientRect(); if (rc.right > innerWidth + 1) { let c = e, clipped = false; while ((c = c.parentElement)) { if (getComputedStyle(c).overflowX !== 'visible') { clipped = true; break; } } if (!clipped) out.push(`${e.tagName}.${String(e.className).slice(0, 60)} → ${Math.round(rc.right)}`); } }); return out.slice(0, 6); }));
    }
  }
  // Rota interna aberta direto (como um link salvo) funciona: fallback de SPA
  await p.goto(BASE + '/relatorios'); await p.waitForTimeout(500);
  ok(await p.locator('h1:has-text("Relatórios")').count() === 1, 'abrir /relatorios direto funciona (sem 404)');

  // Teclado: link "pular para o conteúdo"
  await p.goto(BASE); await p.waitForSelector('text=Missão do dia'); await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement?.textContent?.includes('Pular')), 'primeiro Tab foca "Pular para o conteúdo"');

  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 3).join(' | ')})`);
  await b.close();
  console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
