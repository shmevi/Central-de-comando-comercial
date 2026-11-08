// Teste de fumaça E2E: node e2e/smoke.cjs [baseURL]  (requer `npm run dev` ativo)
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5173';
const ROUTES = ['/', '/rotina', '/agenda', '/tarefas', '/equipes', '/treinamentos', '/reunioes', '/okrs', '/projetos', '/relatorios', '/integracoes', '/configuracoes'];
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
  // Padrão igual ao hub do Notion: colunas por ATRIBUIÇÃO; sem atribuição cai em "Sem atribuição"
  ok(await p.locator('section[aria-label="70%"]').count() === 1 && await p.locator('section[aria-label="OFF WORK (INDIVIDUAL)"]').count() === 1, 'kanban de tarefas por atribuição (como no Notion)');
  await p.getByRole('combobox', { name: 'Mover Confirmar entrevistas e preparar avaliação para' }).selectOption('70%');
  await p.waitForTimeout(300);
  ok(await p.locator('section[aria-label="70%"] li:has-text("Confirmar entrevistas")').count() === 1, 'mover para a coluna 70% define a atribuição');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ccc:v1:tasks') || '[]').find((t) => t.title.startsWith('Confirmar entrevistas'))?.attribution?.[0]) === '70%', 'atribuição gravada na tarefa');
  await p.click('role=radio[name="Status"]'); await p.waitForTimeout(200);
  ok(await p.locator('section[aria-label="Não iniciada"]').count() === 1 && await p.locator('section[aria-label="Pausada"]').count() === 1, 'kanban por status com os nomes do Notion');
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

  // Módulos removidos da interface: sem menu e sem rota (os dados no banco não são tocados)
  for (const r of ['/recrutamento', '/sistemas']) {
    await p.goto(BASE + r); await p.waitForTimeout(300);
    ok(await p.locator('text=Página não encontrada').count() === 1, `${r} não existe mais na interface`);
  }
  await p.goto(BASE + '/');
  ok(await p.locator('nav >> text=Recrutamento').count() === 0 && await p.locator('nav >> text=Sistemas e Melhorias').count() === 0, 'menu sem Recrutamento e Sistemas e Melhorias');

  // Barra lateral: grupos abrem/fecham com setinha (aria-expanded) e o estado persiste
  const grp = p.locator('aside button[aria-controls="lateral-grupo-gest-o"]');
  ok(await grp.getAttribute('aria-expanded') === 'true', 'grupo Gestão começa aberto');
  await grp.click(); await p.waitForTimeout(300);
  ok(await grp.getAttribute('aria-expanded') === 'false' && await p.locator('#lateral-grupo-gest-o').getAttribute('aria-hidden') === 'true', 'grupo Gestão fecha (aria-expanded=false)');
  await p.reload(); await p.waitForSelector('text=Missão do dia');
  ok(await p.locator('aside button[aria-controls="lateral-grupo-gest-o"]').getAttribute('aria-expanded') === 'false', 'grupo fechado continua fechado após recarregar');
  await p.locator('aside button[aria-controls="lateral-grupo-gest-o"]').click();
  await p.goto(BASE + '/equipes'); await p.waitForTimeout(300);
  ok(await p.locator('aside button[aria-controls="lateral-grupo-gest-o"]').getAttribute('aria-expanded') === 'true', 'grupo da página atual fica aberto');

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

  // Origem: Todas / Rotina-Central / Notion — combina com busca, lista e Kanban, sem alterar dados
  await p.goto(BASE + '/tarefas'); await p.waitForSelector('text=Revisar funil de matrículas');
  const totalAntes = await p.evaluate(() => JSON.parse(localStorage.getItem('ccc:v1:tasks') || '[]').length);
  await p.click('role=radio[name^="Notion"]'); await p.waitForTimeout(200);
  ok(await p.locator('li:has-text("Revisar funil de matrículas")').count() === 1 && await p.locator('li:has-text("Tarefa E2E")').count() === 0, 'filtro Notion mostra só tarefas do Notion');
  ok(new URL(p.url()).searchParams.get('origem') === 'notion', 'origem fica na URL');
  await p.fill('#busca', 'funil'); await p.waitForTimeout(150);
  ok(await p.locator('li:has-text("Revisar funil de matrículas")').count() === 1, 'origem + busca combinam');
  await p.fill('#busca', '');
  await p.click('role=radio[name="Kanban"]'); await p.waitForTimeout(200);
  ok(await p.locator('section[aria-label] li:has-text("Tarefa E2E")').count() === 0 && await p.locator('section[aria-label] li:has-text("funil")').count() >= 1, 'origem vale também no Kanban');
  await p.click('role=radio[name="Lista"]');
  await p.click('role=radio[name^="Rotina / Central"]'); await p.waitForTimeout(200);
  ok(await p.locator('li:has-text("Tarefa E2E")').count() === 1 && await p.locator('li:has-text("Revisar funil de matrículas")').count() === 0, 'filtro Central esconde as do Notion');
  await p.click('role=radio[name^="Todas"]');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ccc:v1:tasks') || '[]').length) === totalAntes, 'filtrar não cria nem apaga tarefas');

  // OKRs: "Kanban por Objetivo" como no Notion (colunas = Objetivos, só KRs ativos), status no cartão e envio com confirmação
  await p.goto(BASE + '/okrs'); await p.waitForSelector('text=Kanban por Objetivo');
  ok(await p.locator('section[aria-label="[Demonstração] Objetivo compartilhado"]').count() === 1, 'OKRs: uma coluna por Objetivo');
  ok(await p.locator('section[aria-label] li:has-text("KR normal")').count() === 1, 'KR ativo aparece no quadro');
  await p.getByRole('combobox', { name: 'Status de [Demonstração] KR normal' }).selectOption('Não Atingiu - Faltou Pessoas');
  await p.waitForSelector('text=ainda não estão no Notion');
  ok(await p.locator('section[aria-label] li:has-text("KR normal")').count() === 0, 'KR encerrado sai do quadro (só ativos, como no Notion)');
  await p.click('text=Mostrar KRs encerrados'); await p.waitForTimeout(150);
  ok(await p.locator('section[aria-label] li:has-text("KR normal")').count() === 1, '"Mostrar encerrados" traz o KR de volta');
  await p.click('button:has-text("Revisar e enviar ao Notion")');
  ok(await p.locator('role=dialog >> text=Status:').count() >= 1 && await p.locator('role=dialog >> text=Não Atingiu - Faltou Pessoas').count() >= 1, 'confirmação mostra o que vai mudar no Notion');
  ok(await p.locator('role=dialog >> button:has-text("Enviar 1 ao Notion")').isDisabled(), 'sem a escrita autorizada o envio fica bloqueado');
  await p.keyboard.press('Escape');
  await p.goto(BASE + '/integracoes');
  await p.click('text=Autorizar escrita no Notion'); await p.click('role=dialog >> button:has-text("Autorizo")');
  await p.goto(BASE + '/okrs'); await p.click('button:has-text("Revisar e enviar ao Notion")');
  await p.click('role=dialog >> button:has-text("Enviar 1 ao Notion")');
  ok(await p.locator('text=Notion (demonstração): 1 enviada(s)').waitFor({ timeout: 8000 }).then(() => true, () => false), 'envio confirmado grava no Notion (demonstração)');
  ok(await p.locator('text=ainda não estão no Notion').count() === 0, 'depois do envio não sobra pendência');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ccc:v1:sync_logs') || '[]').some((l) => l.direction === 'escrita' && l.status === 'sucesso')), 'log registra a escrita');

  // Relatórios: conquista registrada fica salva; CSV e PDF
  await p.goto(BASE + '/relatorios'); await p.waitForSelector('text=Tarefas concluídas');
  ok(await p.locator('text=Concluídas — Central').count() === 1 && await p.locator('text=Concluídas — Notion').count() === 1, 'relatório diário separa Central e Notion');
  await p.fill('#entrada-conquista', 'Conquista E2E'); await p.click('button[aria-label="Registrar conquista"]');
  await p.waitForSelector('li:has-text("Conquista E2E")');
  await p.fill('#anotacao-final', 'Anotação final E2E'); await p.click('button:has-text("Salvar anotação")'); await p.waitForTimeout(200);
  await p.reload(); await p.waitForSelector('text=Tarefas concluídas');
  ok(await p.locator('li:has-text("Conquista E2E")').count() === 1 && await p.inputValue('#anotacao-final') === 'Anotação final E2E', 'conquista e anotação final persistem após recarregar');
  await p.click('role=radio[name="Semanal"]'); await p.waitForTimeout(200);
  ok(await p.locator('text=Evolução de OKRs').count() === 1 && await p.locator('text=Prioridades da próxima semana').count() === 1 && await p.locator('li:has-text("Conquista E2E")').count() === 1, 'relatório semanal com OKRs, prioridades e conquistas da semana');
  await p.click('role=radio[name="Diário"]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("CSV")')]);
  ok(dl.suggestedFilename().endsWith('.csv'), 'exporta CSV');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("PDF")')]);
  ok(dl2.suggestedFilename().endsWith('.pdf'), 'exporta PDF');

  // Logo personalizada (modo local): escolher, prévia, persistir e remover
  await p.goto(BASE + '/configuracoes'); await p.waitForSelector('text=Identidade visual');
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('input[aria-label="Arquivo da logo"]', { name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('text=Logo personalizada em uso.');
  ok(await p.locator('aside img[alt="Logo da Central"]').count() === 1, 'logo personalizada aparece na barra lateral');
  await p.reload(); await p.waitForSelector('text=Identidade visual');
  ok(await p.locator('text=Logo personalizada em uso.').count() === 1, 'logo persiste após recarregar');
  await p.setInputFiles('input[aria-label="Arquivo da logo"]', { name: 'falsa.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  ok(await p.locator('text=Formato não aceito').waitFor({ timeout: 3000 }).then(() => true, () => false), 'SVG disfarçado de PNG é recusado');
  await p.click('button:has-text("Remover logo personalizada")'); await p.click('role=dialog >> button:has-text("Remover")');
  await p.waitForSelector('text=Usando o monograma padrão');
  ok(await p.locator('aside img[alt="Logo da Central"]').count() === 0, 'sem logo personalizada volta o monograma CP');

  // Todas as rotas em celular (360/390), tablet e desktop, sem rolagem horizontal
  for (const vp of [{ width: 1366, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 780 }]) {
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

  // Fonte de identidade "Capture It" carregada (embutida, servida pelo próprio site) e marca sem corte
  await p.setViewportSize({ width: 1366, height: 900 }); await p.goto(BASE); await p.waitForSelector('text=Missão do dia');
  ok(await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Capture It"'); }), 'fonte Capture It carregada');
  ok(await p.locator('aside div.font-brand').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'nome "Central de Comando" cabe na barra lateral');

  // Teclado: link "pular para o conteúdo"
  await p.goto(BASE); await p.waitForSelector('text=Missão do dia'); await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement?.textContent?.includes('Pular')), 'primeiro Tab foca "Pular para o conteúdo"');

  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 3).join(' | ')})`);
  await b.close();
  console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
