// Teste de fumaça E2E: node e2e/smoke.cjs [baseURL]  (requer `npm run dev` ativo)
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5173';
const ROUTES = ['/', '/rotina', '/agenda', '/tarefas', '/equipes', '/equipes?aba=numeros', '/treinamentos', '/reunioes', '/okrs', '/projetos', '/relatorios', '/integracoes', '/configuracoes'];
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
  await p.waitForSelector('input[aria-label="Reabrir Tarefa E2E"]', { state: 'attached' });
  ok(await p.locator('text=Tarefa concluída.').count() === 1 && await p.locator('button:has-text("Desfazer")').count() === 1, 'concluir mostra o aviso com "Desfazer"');
  await p.click('button:has-text("Desfazer")'); await p.waitForSelector('input[aria-label="Concluir Tarefa E2E"]');
  ok(true, '"Desfazer" volta a tarefa para aberta');
  await p.locator('input[aria-label="Concluir Tarefa E2E"]').check();
  await p.waitForSelector('input[aria-label="Reabrir Tarefa E2E"]', { state: 'attached' });
  ok(await p.locator('input[aria-label="Reabrir Tarefa E2E"]').count() === 1, 'tarefa concluída');

  // Persistência
  await p.reload(); await p.waitForSelector('#nova-rapida');
  ok(await p.locator('summary:has-text("Concluídas")').count() === 1, 'concluídas ficam recolhidas no fim da lista');

  // Lista agrupada por prazo, abas e adicionar rápido (Enter)
  ok(await p.locator('h2:has-text("Atrasadas") + ul li').count() >= 1, 'lista agrupada por prazo (grupo Atrasadas)');
  await p.fill('#nova-rapida', 'Rapida E2E'); await p.keyboard.press('Enter');
  await p.waitForSelector('h2:has-text("Sem prazo") + ul li:has-text("Rapida E2E")');
  ok(true, 'adicionar rápido cria a tarefa (sem prazo) com Enter');
  await p.click('button[aria-pressed]:has-text("Hoje")'); await p.waitForTimeout(150);
  ok(new URL(p.url()).searchParams.get('f') === 'hoje' && await p.locator('li:has-text("Rapida E2E")').count() === 0, 'aba Hoje mostra só o que vence hoje');
  await p.fill('#nova-rapida', 'Para hoje E2E'); await p.keyboard.press('Enter'); await p.waitForSelector('li:has-text("Para hoje E2E")');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ccc:v1:tasks') || '[]').find((t) => t.title === 'Para hoje E2E')?.due_date) === recifeToday(), 'na aba Hoje, a tarefa rápida já nasce com prazo de hoje');
  await p.click('button[aria-pressed]:has-text("Todas")'); await p.waitForTimeout(150);
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
  for (const label of ['Concluir', 'Reabrir', 'Concluir']) {
    if (label === 'Reabrir' && !(await p.locator('details:has(summary:has-text("Concluídas"))').getAttribute('open').then((v) => v !== null))) await p.click('summary:has-text("Concluídas")');
    await p.locator(`input[aria-label="${label} Recorrente E2E"]`).first().click(); await p.waitForTimeout(600);
  }
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
  ok(await p.locator('role=radio[name^="Notion"]').count() === 0, 'filtros ficam recolhidos até tocar em "Filtros"');
  await p.click('button:has-text("Filtros")');
  await p.click('role=radio[name^="Notion"]'); await p.waitForTimeout(200);
  ok(await p.locator('button[aria-label="Remover filtro: Origem: Notion"]').count() === 1, 'filtro ligado aparece como etiqueta removível');
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

  // Conteúdo da página do Notion: aparece na tarefa (somente leitura) e no KR
  await p.goto(BASE + '/tarefas'); await p.click('button:has-text("[Demonstração] Revisar funil de matrículas")');
  const desc = p.locator('role=dialog >> textarea');
  ok((await desc.inputValue()).includes('Conferir as etapas do funil') && await desc.getAttribute('readonly') !== null, 'tarefa do Notion mostra o conteúdo da página (somente leitura)');
  await p.keyboard.press('Escape');
  await p.goto(BASE + '/okrs'); await p.waitForSelector('text=Kanban por Objetivo');
  await p.click('section[aria-label] button:has-text("[Demonstração] KR normal")');
  ok(await p.locator('role=dialog >> text=Matrículas do trimestre').count() === 1 && await p.locator('role=dialog >> text=Como medir').count() === 1, 'KR mostra Descrição e conteúdo da página do Notion');
  await p.keyboard.press('Escape');
  ok(await p.locator('text=Conteúdo privado de outra pessoa').count() === 0, 'conteúdo de página de outra pessoa não chega à Central');

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

  // Feedback em números: lançar mês → conversão e ticket calculados → editar/excluir → página da pessoa → feedback com painel congelado
  {
    const NOME = 'Pessoa Números E2E';
    await p.goto(BASE + '/equipes'); await p.getByRole('button', { name: 'Pessoa', exact: true }).first().click();
    await p.fill('role=dialog >> label:has-text("Nome") >> xpath=following-sibling::input', NOME);
    await p.click('role=dialog >> label:has-text("CPPEM")'); await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
    await p.goto(BASE + '/equipes?aba=numeros'); await p.waitForSelector('text=Lançar');
    await p.getByRole('combobox', { name: /^Instituição/ }).first().selectOption({ label: 'CPPEM' }); await p.waitForTimeout(200);
    const card = p.locator(`li:has-text("${NOME}")`);
    const field = (label) => p.locator(`role=dialog >> label:text-is("${label}") >> xpath=following-sibling::input`);
    await card.getByRole('button', { name: /^Lançar / }).click();
    await field('Leads').fill('40'); await field('Matrículas').fill('10'); await p.locator('role=dialog >> label:has-text("Valor (R$)") >> xpath=following-sibling::input').fill('12.000,00');
    ok(await p.locator('role=dialog >> text=25,0%').count() === 1 && await p.locator('role=dialog >> text=R$ 1.200,00').count() === 1, 'prévia calcula conversão e ticket no lançamento');
    await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
    ok(await card.locator('text=25,0%').count() === 1 && await card.locator('text=R$ 1.200,00').count() === 1, 'Números: conversão (25,0%) e ticket (R$ 1.200,00) calculados');
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('ccc:v1:person_metrics') || '[]').filter((m) => !m.is_demo));
    ok(stored.length === 1 && stored[0].leads === 40 && stored[0].enrollments === 10 && stored[0].revenue === 12000 && /-01$/.test(stored[0].month) && !('conversion' in stored[0]) && !('ticket' in stored[0]), 'só leads, matrículas e valor são gravados (conversão/ticket nunca)');
    // editar (com aviso de matrículas > leads, sem bloquear) e conferir
    await card.getByRole('button', { name: `Editar lançamento de ${NOME}` }).click();
    await field('Matrículas').fill('50');
    ok(await p.locator('role=dialog >> text=Matrículas acima dos leads').count() === 1, 'matrículas > leads: só sinaliza');
    await field('Matrículas').fill('12'); await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
    ok(await card.locator('text=30,0%').count() === 1 && await card.locator('text=R$ 1.000,00').count() === 1, 'editar recalcula (30,0% · R$ 1.000,00)');
    // duplicata recusada
    await p.locator('button:has-text("Lançar")').first().click();
    await p.locator('role=dialog >> select').first().selectOption({ label: NOME });
    await field('Leads').fill('1'); await field('Matrículas').fill('1'); await p.click('role=dialog >> button:has-text("Salvar")');
    ok(await p.locator('role=dialog >> text=Já existe lançamento').count() === 1, 'lançamento duplicado (pessoa × instituição × mês) é recusado');
    await p.keyboard.press('Escape');
    // excluir com confirmação → mês fica vazio (sem zero)
    await card.getByRole('button', { name: `Excluir lançamento de ${NOME}` }).click(); await p.click('role=dialog >> button:has-text("Excluir")'); await p.waitForTimeout(300);
    ok(await card.locator('text=Sem lançamento').count() === 1 && await card.locator('text=0,0%').count() === 0, 'excluir deixa o mês vazio (sem zero)');
    await card.getByRole('button', { name: /^Lançar / }).click();
    await field('Leads').fill('40'); await field('Matrículas').fill('12'); await p.locator('role=dialog >> label:has-text("Valor (R$)") >> xpath=following-sibling::input').fill('12000');
    await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
    // página da pessoa
    await card.getByRole('link', { name: `Ver números de ${NOME}` }).click(); await p.waitForSelector('text=Mês a mês');
    ok(await p.locator('section[aria-label^="Números de"] >> text=30,0%').count() === 1 && await p.locator('section[aria-label^="Números de"] >> text=R$ 1.000,00').count() === 1, 'página da pessoa: conversão e ticket do mês');
    ok(await p.locator('text=sem lançamento').count() >= 6, 'meses sem lançamento aparecem vazios na tabela');
    ok(await p.locator('figure[role="img"]').count() === 2, 'gráficos de conversão e ticket (com descrição acessível)');
    const personUrl = p.url();
    // feedback com o painel de números, congelado ao salvar
    await p.getByRole('link', { name: 'Dar feedback' }).click(); await p.waitForTimeout(300);
    const enter = p.locator('button:has-text("Entrar mesmo assim")'); if (await enter.count()) { await enter.click(); await p.waitForTimeout(200); }
    await p.locator('role=dialog').waitFor();
    await p.locator('role=dialog >> select').nth(1).selectOption({ label: 'CPPEM' });
    ok(await p.locator('role=dialog >> text=serão congelados ao salvar').count() === 1 && await p.locator('role=dialog >> section[aria-label="Números da pessoa"] >> text=30,0%').count() >= 1, 'feedback mostra o painel com os números da pessoa');
    await p.fill('role=dialog >> label:has-text("Pontos positivos") >> xpath=following-sibling::textarea', 'Boa conversão no mês.');
    await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
    const fbCard = p.locator(`li:has-text("${NOME}"):has-text("Boa conversão")`);
    ok(await fbCard.locator('text=/Números no feedback .*30,0%/').count() === 1, 'feedback salvo com os números');
    // mudar o lançamento depois NÃO altera o feedback (congelado)
    await p.goto(BASE + '/equipes?aba=numeros'); await p.getByRole('combobox', { name: /^Instituição/ }).first().selectOption({ label: 'CPPEM' });
    await card.getByRole('button', { name: `Editar lançamento de ${NOME}` }).click(); await field('Matrículas').fill('20'); await p.click('role=dialog >> button:has-text("Salvar")'); await p.waitForTimeout(300);
    await p.goto(BASE + '/equipes?aba=feedbacks'); await p.waitForTimeout(300);
    const enter2 = p.locator('button:has-text("Entrar mesmo assim")'); if (await enter2.count()) { await enter2.click(); await p.waitForTimeout(200); }
    ok(await fbCard.locator('text=/30,0%/').count() === 1 && await fbCard.locator('text=/50,0%/').count() === 0, 'números do feedback ficam congelados');
    // 360px na página da pessoa: sem rolagem horizontal
    await p.setViewportSize({ width: 360, height: 780 }); await p.goto(personUrl); await p.waitForSelector('text=Mês a mês');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'página da pessoa sem rolagem horizontal em 360px');
    await p.setViewportSize({ width: 1366, height: 900 });
  }

  // Logo personalizada (modo local): escolher, prévia, persistir e remover
  await p.goto(BASE + '/configuracoes'); await p.waitForSelector('text=Identidade visual');
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('input[aria-label="Arquivo da logo"]', { name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('text=Logo personalizada em uso.');
  ok(await p.locator('aside img[alt="Logo da Central"]').count() === 1, 'logo personalizada aparece na barra lateral');
  await p.reload(); await p.waitForSelector('text=Identidade visual');
  ok(await p.locator('text=Logo personalizada em uso.').count() === 1, 'logo persiste após recarregar');
  // Ícone do app (aba e atalho na tela inicial) = logo enviada
  await p.waitForFunction(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href')?.startsWith('blob:'), null, { timeout: 5000 }).catch(() => {});
  const icon = await p.evaluate(() => ({
    fav: document.querySelector('link[rel="icon"][data-app-icon]')?.getAttribute('href') ?? '',
    apple: document.querySelector('link[rel="apple-touch-icon"][data-app-icon]')?.getAttribute('href') ?? '',
    defaultsLeft: document.querySelectorAll('link[rel="icon"]:not([data-app-icon]), link[rel="apple-touch-icon"]:not([data-app-icon])').length,
  }));
  ok(icon.fav.startsWith('data:image/png') && icon.apple.startsWith('data:image/png') && icon.defaultsLeft === 0, 'aba e atalho do iPhone usam a logo enviada');
  // O manifesto como o próprio Chrome lê (respeitando a CSP manifest-src)
  const cdp = await p.context().newCDPSession(p);
  const am = await cdp.send('Page.getAppManifest');
  const m = JSON.parse(am.data || '{}');
  ok(am.url.startsWith('blob:') && !(am.errors || []).length && (m.icons || []).length === 3 && m.icons.every((i) => i.src.startsWith('data:image/png')) && m.name === 'Central de Comando Comercial' && m.display === 'standalone' && m.start_url === BASE.replace(/\/$/, '') + '/',
    `manifesto do atalho (Android) com os ícones da logo${(am.errors || []).length ? ` — erros: ${JSON.stringify(am.errors)}` : ''}`);
  // Logo grande é reduzida (≤512 px, WebP) antes de salvar — deixa a abertura do app leve
  {
    const big = await b.newPage(); await big.setViewportSize({ width: 1200, height: 1200 });
    await big.setContent('<div style="width:1200px;height:1200px;background:linear-gradient(135deg,#d4af5a,#0b0b0d 60%,#e9852b)"></div>');
    const bigPng = await big.screenshot(); await big.close();
    await p.setInputFiles('input[aria-label="Arquivo da logo"]', { name: 'grande.png', mimeType: 'image/png', buffer: bigPng });
    await p.waitForFunction(() => /^data:image\/webp/.test(JSON.parse(localStorage.getItem('ccc:v1:settings') || '[]')[0]?.logo_path || ''), null, { timeout: 8000 }).catch(() => {});
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ccc:v1:settings') || '[]')[0]?.logo_path || '');
    const dims = await p.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r([0, 0]); i.src = u; }), saved);
    ok(saved.startsWith('data:image/webp') && dims[0] <= 512 && dims[1] <= 512 && saved.length < bigPng.length * 1.37, `logo grande salva otimizada (${dims.join('×')}, ${Math.round(saved.length / 1024)} KB em vez de ${Math.round(bigPng.length / 1024)} KB)`);
  }
  await p.setInputFiles('input[aria-label="Arquivo da logo"]', { name: 'falsa.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  ok(await p.locator('text=Formato não aceito').waitFor({ timeout: 3000 }).then(() => true, () => false), 'SVG disfarçado de PNG é recusado');
  await p.click('button:has-text("Remover logo personalizada")'); await p.click('role=dialog >> button:has-text("Remover")');
  await p.waitForSelector('text=Usando o monograma padrão');
  ok(await p.locator('aside img[alt="Logo da Central"]').count() === 0, 'sem logo personalizada volta o monograma CP');
  ok(await p.evaluate(() => document.querySelector('link[rel="manifest"]').getAttribute('href') === '/manifest.webmanifest' && !document.querySelector('link[data-app-icon]') && !!document.querySelector('link[rel="apple-touch-icon"][href="/icons/apple-touch-icon.png"]')),
    'sem logo, aba e atalho voltam ao ícone CP');
  ok(await p.evaluate(async () => { const r = await fetch('/manifest.webmanifest'); const m = await r.json(); const imgs = await Promise.all(m.icons.map((i) => fetch(i.src).then((x) => x.ok && x.headers.get('content-type') === 'image/png'))); return r.ok && /manifest\+json/.test(r.headers.get('content-type') || '') && imgs.every(Boolean); }), 'manifesto padrão e ícones PNG publicados');

  // Todas as rotas em celular (360/390), tablet e desktop, sem rolagem horizontal
  for (const vp of [{ width: 1366, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 780 }]) {
    await p.setViewportSize(vp);
    for (const r of ROUTES) {
      await p.goto(BASE + r); await p.waitForTimeout(400);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(sw <= 0, `${vp.width}px ${r} sem rolagem horizontal (${sw})`);
      // Nenhum texto visível por cima de botão/campo (ex.: título comprido invadindo o seletor de status)
      const over = await p.evaluate(() => {
        const out = [];
        const vis = (el) => { const st = getComputedStyle(el); const rc = el.getBoundingClientRect(); return st.visibility !== 'hidden' && st.display !== 'none' && rc.width > 0 && rc.height > 0; };
        const main = document.querySelector('main'); if (!main) return out;
        const controls = [...main.querySelectorAll('select, button, input, textarea, a')].filter(vis);
        const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const el = n.parentElement;
          if (!n.textContent.trim() || !el || !vis(el) || el.closest('.sr-only') || el.closest('select')) continue;
          const range = document.createRange(); range.selectNodeContents(n);
          for (const tr of range.getClientRects()) for (const c of controls) {
            if (c.contains(n)) continue;
            const cr = c.getBoundingClientRect();
            if (Math.min(tr.right, cr.right) - Math.max(tr.left, cr.left) > 4 && Math.min(tr.bottom, cr.bottom) - Math.max(tr.top, cr.top) > 4) out.push(n.textContent.trim().slice(0, 30));
          }
        }
        return [...new Set(out)];
      });
      ok(over.length === 0, `${vp.width}px ${r} sem texto sobreposto a botões/campos${over.length ? ` (${over.slice(0, 3).join(' | ')})` : ''}`);
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
