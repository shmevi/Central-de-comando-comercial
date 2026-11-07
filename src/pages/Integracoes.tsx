import * as React from 'react';
import { CheckCircle2, Info, Plug, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { useCollection } from '@/data/store';
import { useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, EmptyState, Card, DemoBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { MOCK_NOTION_CONFIG, mockNotionAdapter } from '@/integrations/notion/mockAdapter';
import { chooseObjective, discardReview, resolveConflict, syncNotion } from '@/integrations/notion/sync';
import { ACTIVE_STATUS_GROUPS, PROPS, REQUIRED_NOTION_FIELDS, TASK_PRIORITY_MAP, TASK_STATUS_MAP, checkNotionConfig, describeConfigProblem, isNotionId, normalizePageId, resolveNotionConfig } from '@/integrations/notion/config';
import type { NotionConfig, ReviewKind, ReviewQueueItem } from '@/domain/types';
import { PRIORITY, TASK_STATUS } from '@/domain/labels';
import { fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

/** Adaptador em uso. Hoje só existe o de demonstração; o real (API do Notion, no servidor) é uma fase posterior. */
const adapter = mockNotionAdapter;

const ENT_LABEL: Record<string, string> = { tarefas: 'Tarefas', krs: 'KRs', objetivos: 'Objetivos', okrs: 'OKRs (antigo)', reunioes: 'Reuniões (antigo)', geral: 'Geral' };
const KIND_LABEL: Record<ReviewKind, string> = {
  valor_desconhecido: 'Valor desconhecido', kr_sem_objetivo: 'KR sem Objetivo', kr_multiplos_objetivos: 'KR com vários Objetivos',
  conflito: 'Conflito', instituicao: 'Sem instituição (antigo)', reuniao_sem_data: 'Reunião sem data (antigo)',
};
const kindOf = (q: ReviewQueueItem): ReviewKind => q.kind ?? 'instituicao';

function ReviewRow({ item }: { item: ReviewQueueItem }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const options = (item.payload.objectives as { id: string; title: string | null }[] | undefined) ?? [];
  const [choice, setChoice] = React.useState('');
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); } catch (e) { toast((e as Error).message, 'erro'); } finally { setBusy(false); }
  };
  const kind = kindOf(item);
  const fields = (item.payload.fields as string[] | undefined) ?? [];
  const notion = item.payload.notion as Record<string, unknown> | undefined;
  const central = item.payload.central as Record<string, unknown> | undefined;
  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{item.title} {item.is_demo && <DemoBadge />}</div>
          <div className="text-xs text-muted">{ENT_LABEL[item.entity] ?? item.entity} · <span className="text-orange">{KIND_LABEL[kind]}</span> · {item.reason}</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {kind === 'kr_multiplos_objetivos' && <>
            <SelectField label="Objetivo na Central" className="w-56" value={choice} onChange={(e) => setChoice(e.target.value)} placeholder="Escolha…"
              options={options.map((o) => ({ value: o.id, label: o.title ?? '(Objetivo sem título)' }))} />
            <Button size="sm" disabled={busy || !choice} onClick={() => run(() => chooseObjective(item, choice), 'Escolha registrada. O KR entra na próxima sincronização.')}>Confirmar</Button>
          </>}
          {kind === 'conflito' && <>
            <Button size="sm" disabled={busy} onClick={() => run(() => resolveConflict(item, 'manter_notion'), 'Mantido o valor do Notion.')}>Manter Notion</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => resolveConflict(item, 'manter_central'), 'Mantido o valor da Central (pendente de envio).')}>Manter Central</Button>
          </>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => discardReview(item), 'Pendência descartada (nada foi alterado no Notion).')}>Descartar</Button>
        </div>
      </div>
      {kind === 'conflito' && notion && central && (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="p-1">Campo</th><th className="p-1">Notion</th><th className="p-1">Central</th></tr></thead>
          <tbody>{fields.map((f) => <tr key={f} className="border-t border-border"><td className="p-1">{f}</td><td className="p-1">{String(notion[f] ?? '—')}</td><td className="p-1">{String(central[f] ?? '—')}</td></tr>)}</tbody>
        </table>
      )}
    </li>
  );
}

/** IDs do workspace: só aqui, salvos em settings.notion_config. Nunca há valor padrão no código. */
function NotionConfigForm({ cfg, onSave, demo }: { cfg: NotionConfig; onSave: (c: NotionConfig) => Promise<unknown>; demo: boolean }) {
  const toast = useToast();
  const [d, setD] = React.useState(cfg);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setD(cfg); }, [cfg.person_id, cfg.person_name, cfg.tasks_data_source_id, cfg.krs_data_source_id, cfg.objectives_data_source_id]);
  const err = (k: keyof NotionConfig) => { const v = String(d[k] ?? '').trim(); return v && !isNotionId(v) ? 'Formato inválido (ID do Notion com 32 caracteres hexadecimais).' : null; };
  async function save(next: NotionConfig) {
    const clean: NotionConfig = { ...next, person_name: next.person_name.trim() };
    for (const [k] of REQUIRED_NOTION_FIELDS) { const v = String(clean[k] ?? '').trim(); (clean as any)[k] = v && isNotionId(v) ? normalizePageId(v) : v; }
    const c = checkNotionConfig(clean);
    setBusy(true);
    try { await onSave(clean); toast(c.ok ? 'Configuração salva.' : `Salvo, mas incompleto: ${describeConfigProblem(c)}.`, c.ok ? undefined : 'erro'); }
    catch (e) { toast((e as Error).message, 'erro'); } finally { setBusy(false); }
  }
  return (
    <Card className="space-y-3 p-4 text-sm">
      <h2 className="text-lg text-gold">Responsável e bases</h2>
      <TextField label="Nome do responsável (só exibição)" value={d.person_name} onChange={(e) => setD({ ...d, person_name: e.target.value })} />
      {REQUIRED_NOTION_FIELDS.map(([k, label]) => (
        <TextField key={k} label={label} required value={String(d[k] ?? '')} error={err(k)} spellCheck={false} autoComplete="off"
          onChange={(e) => setD({ ...d, [k]: e.target.value })} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => save(d)}>Salvar configuração</Button>
        {demo && <Button size="sm" variant="secondary" disabled={busy} onClick={() => save({ ...MOCK_NOTION_CONFIG, cursors: {}, last_sync_at: cfg.last_sync_at })}>Usar IDs de demonstração</Button>}
      </div>
      <p className="text-xs text-muted">Sem estes IDs a sincronização não roda. Eles ficam salvos nas suas configurações, não no código do app. O token do Notion nunca fica aqui.</p>
    </Card>
  );
}

export default function Integracoes() {
  const { settings, save } = useSettings();
  const logs = useCollection('sync_logs');
  const queue = useCollection('review_queue');
  const states = useCollection('notion_sync_state');
  const tasks = useCollection('tasks');
  const objectives = useCollection('objectives');
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [tab, setTab] = React.useState<'conexao' | 'mapeamento' | 'revisao' | 'conflitos' | 'log'>('conexao');
  const [syncing, setSyncing] = React.useState(false);
  const cfg = resolveNotionConfig(settings);
  const cfgCheck = checkNotionConfig(cfg);
  const who = cfg.person_name || 'responsável configurado';
  const pending = queue.items.filter((q) => !q.resolved);
  const conflicts = pending.filter((q) => kindOf(q) === 'conflito');
  const others = pending.filter((q) => kindOf(q) !== 'conflito');

  async function toggleEnabled(v: boolean) {
    if (v && !(await confirm({ title: 'Ativar leitura do Notion', message: 'Nesta fase o app usa um adaptador de DEMONSTRAÇÃO (dados fictícios). Nada será lido de um workspace real e nada será escrito. Ativar?', confirmLabel: 'Ativar leitura' }))) return;
    await save({ notion_enabled: v, ...(v ? {} : { notion_write_enabled: false }) });
  }
  async function toggleWrite(v: boolean) {
    if (v && !(await confirm({ title: 'Permitir escrita no Notion', message: 'A escrita altera dados externos. Nesta versão nenhuma operação de escrita está implementada; esta chave apenas registra sua autorização para a fase futura, e cada escrita ainda exigirá confirmação individual. Confirmar?', confirmLabel: 'Autorizo', danger: true }))) return;
    await save({ notion_write_enabled: v });
  }
  async function runSync() {
    setSyncing(true);
    try {
      const c = await syncNotion(adapter, settings, save);
      await Promise.all([tasks.reload(), objectives.reload(), states.reload(), queue.reload(), logs.reload()]);
      const rev = c.tarefas.revisao + c.krs.revisao, conf = c.tarefas.conflitos + c.krs.conflitos;
      toast(`Leitura concluída${adapter.isDemo ? ' (demonstração)' : ''}: ${c.tarefas.criados + c.tarefas.atualizados} tarefa(s) e ${c.krs.criados + c.krs.atualizados} KR(s) importados/atualizados, ${rev} para revisão${conf ? `, ${conf} conflito(s)` : ''}.`);
    } catch (e) { toast((e as Error).message, 'erro'); } finally { setSyncing(false); }
  }

  return (
    <div>
      <PageHeader title="Integrações" subtitle={`Notion — somente leitura · Tarefas e OKRs de ${who}`}
        actions={<Segmented label="Seção" value={tab} onChange={setTab} options={[
          { value: 'conexao', label: 'Conexão' }, { value: 'mapeamento', label: 'Campos' },
          { value: 'revisao', label: `Revisão${others.length ? ` (${others.length})` : ''}` },
          { value: 'conflitos', label: `Conflitos${conflicts.length ? ` (${conflicts.length})` : ''}` },
          { value: 'log', label: 'Log' }]} />} />
      {adapter.isDemo && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-orange/50 bg-orange/5 p-3 text-sm">
          <Info size={18} className="mt-0.5 shrink-0 text-orange" />
          <p><strong className="text-orange">Modo demonstração.</strong> A conexão usa um adaptador fictício. Nenhum workspace real do Notion é acessado e nenhum dado externo é alterado. Itens importados ficam marcados como demonstração.</p>
        </div>
      )}

      {tab === 'conexao' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-4 p-4">
            <div className="flex items-center gap-3"><Plug className="text-gold" /><div><h2 className="text-lg">Notion</h2><p className="text-xs text-muted">Adaptador: {adapter.kind === 'mock' ? 'Demonstração (mock)' : adapter.kind.toUpperCase()}</p></div>
              <span className={cn('chip ml-auto', settings.notion_enabled ? 'border-success/60 text-success' : 'border-border text-muted')}>{settings.notion_enabled ? <><CheckCircle2 size={12} />Leitura ativa</> : <><XCircle size={12} />Desativado</>}</span></div>
            <Checkbox label="Ativar leitura (tarefas e OKRs)" checked={settings.notion_enabled} onChange={toggleEnabled} />
            <div className="rounded-lg border border-border p-3">
              <Checkbox label={<span className="flex items-center gap-1"><ShieldAlert size={14} className="text-danger" />Autorizar escrita no Notion (fase futura)</span>} checked={settings.notion_write_enabled} disabled={!settings.notion_enabled} onChange={toggleWrite} />
              <p className="mt-1 text-xs text-muted">Desativada por padrão. Mesmo ativada, cada escrita exigirá confirmação explícita. Nenhuma escrita está implementada nesta versão.</p>
            </div>
            {!cfgCheck.ok && (
              <p role="alert" className="rounded-lg border border-danger/60 p-2 text-xs text-danger">Configuração incompleta — {describeConfigProblem(cfgCheck)}. Preencha em <strong>Campos</strong>. A sincronização fica bloqueada até lá.</p>
            )}
            <Button onClick={runSync} disabled={!settings.notion_enabled || syncing || !cfgCheck.ok}><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Lendo…' : 'Sincronizar (somente leitura)'}</Button>
            <p className="text-xs text-muted">Última leitura: {cfg.last_sync_at ? fmtDateTime(cfg.last_sync_at) : 'nunca'}</p>
          </Card>
          <Card className="p-4 text-sm">
            <h2 className="mb-2 text-lg text-gold">Como funciona</h2>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Só entram Tarefas e KRs cujo responsável é <strong>{who}</strong>, conferido pelo ID do usuário no Notion — na consulta e de novo antes de gravar.</li>
              <li>Itens de outras pessoas ou sem responsável são ignorados: não entram, não vão para revisão e não aparecem no log.</li>
              <li>Nesta fase entram só itens ativos (a fazer / em andamento). Itens já importados continuam sendo atualizados.</li>
              <li>Itens do Notion são pessoais (sem instituição) e aparecem em qualquer filtro de instituição.</li>
              <li>Valor fora do mapeamento, KR sem Objetivo ou com vários Objetivos vão para a revisão — nada é adivinhado.</li>
              <li>Se o mesmo item mudou no Notion e na Central, nada é sobrescrito: vira um conflito para você decidir.</li>
            </ol>
          </Card>
        </div>
      )}

      {tab === 'mapeamento' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <NotionConfigForm cfg={cfg} demo={adapter.isDemo} onSave={(c) => save({ notion_config: c })} />
            <p className="px-1 text-xs text-muted">Status lidos: {ACTIVE_STATUS_GROUPS.map((g) => (g === 'to_do' ? 'a fazer' : 'em andamento')).join(' e ')}. Os nomes das propriedades abaixo são fixos para que um nome errado não possa ser digitado.</p>
          </div>
          <Card className="space-y-2 p-4 text-sm">
            <h2 className="text-lg text-gold">Tarefas</h2>
            <ul className="space-y-1 text-muted">
              <li>Título ← <code>{PROPS.tarefas.title}</code></li><li>Status ← <code>{PROPS.tarefas.status}</code></li>
              <li>Prioridade ← <code>{PROPS.tarefas.priority}</code></li><li>Prazo ← <code>{PROPS.tarefas.due_date}</code> (início)</li>
              <li>Responsável ← <code>{PROPS.tarefas.responsible}</code></li><li>Instituição: nenhuma (item pessoal)</li>
            </ul>
            <h3 className="pt-2 text-sm font-semibold">Status</h3>
            <ul className="text-xs text-muted">{Object.entries(TASK_STATUS_MAP).map(([n, c]) => <li key={n}>{n} → {TASK_STATUS[c]}</li>)}</ul>
            <h3 className="pt-2 text-sm font-semibold">Prioridade</h3>
            <ul className="text-xs text-muted">{Object.entries(TASK_PRIORITY_MAP).map(([n, c]) => <li key={n}>{n} → {PRIORITY[c].label}</li>)}</ul>
          </Card>
          <Card className="space-y-2 p-4 text-sm">
            <h2 className="text-lg text-gold">OKRs</h2>
            <ul className="space-y-1 text-muted">
              <li>Objetivo ← <code>{PROPS.krs.objective}</code> → <code>{PROPS.objetivos.title}</code> (somente leitura)</li>
              <li>KR ← <code>{PROPS.krs.title}</code></li><li>Meta ← <code>{PROPS.krs.target}</code> · Atual ← <code>{PROPS.krs.current}</code></li>
              <li>Valor inicial: não existe no Notion (fica vazio)</li><li>Status ← <code>{PROPS.krs.status}</code> (texto exato)</li>
              <li>Período ← <code>{PROPS.krs.period}</code> · Progresso ← <code>{PROPS.krs.progress}</code> (fórmula, só leitura)</li>
              <li>Responsável ← <code>{PROPS.krs.responsible}</code></li>
            </ul>
          </Card>
        </div>
      )}

      {tab === 'revisao' && (queue.loading ? <Loading /> : others.length === 0 ? <EmptyState title="Fila vazia" description="Valores desconhecidos e KRs sem Objetivo (ou com vários) aparecerão aqui." /> : (
        <ul className="space-y-2">{others.map((q) => <ReviewRow key={q.id} item={q} />)}</ul>
      ))}

      {tab === 'conflitos' && (queue.loading ? <Loading /> : conflicts.length === 0 ? <EmptyState title="Sem conflitos" description="Quando o mesmo item mudar no Notion e na Central, ele aparece aqui — nada é sobrescrito sem a sua decisão." /> : (
        <ul className="space-y-2">{conflicts.map((q) => <ReviewRow key={q.id} item={q} />)}</ul>
      ))}

      {tab === 'log' && (logs.loading ? <Loading /> : logs.items.length === 0 ? <EmptyState title="Sem registros" description="As sincronizações aparecerão aqui." /> : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="p-3">Quando</th><th className="p-3">Entidade</th><th className="p-3">Status</th><th className="p-3">Mensagem</th><th className="p-3">Campos</th></tr></thead>
            <tbody>
              {[...logs.items].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-3 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                  <td className="p-3">{ENT_LABEL[l.entity] ?? l.entity} {l.is_demo_source && <DemoBadge />}</td>
                  <td className={cn('p-3', l.status === 'erro' ? 'text-danger' : l.status === 'revisao' ? 'text-orange' : 'text-success')}>{l.status === 'erro' ? 'Erro' : l.status === 'revisao' ? 'Com revisão' : 'Sucesso'}</td>
                  <td className="p-3">{l.message}</td>
                  <td className="p-3 text-xs text-muted">{l.fields_changed?.join(', ') ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
      {confirmNode}
    </div>
  );
}
