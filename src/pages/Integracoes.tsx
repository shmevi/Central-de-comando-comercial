import * as React from 'react';
import { CheckCircle2, Info, Plug, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useInstitutions, useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, EmptyState, Card, DemoBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Checkbox, TextField } from '@/components/ui/form';
import { InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import { mockNotionAdapter } from '@/integrations/notion/mockAdapter';
import { importPage, isoDate, resolveInstitution, syncRead } from '@/integrations/notion/sync';
import type { NotionEntity } from '@/integrations/notion/adapter';
import type { ReviewQueueItem } from '@/domain/types';
import { fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const FIELDS: Record<NotionEntity, { key: string; label: string }[]> = {
  tarefas: [{ key: 'title', label: 'Título' }, { key: 'status', label: 'Status' }, { key: 'due_date', label: 'Prazo' }, { key: 'institution', label: 'Instituição' }, { key: 'priority', label: 'Prioridade' }],
  okrs: [{ key: 'title', label: 'Objetivo' }, { key: 'cycle', label: 'Ciclo' }, { key: 'institution', label: 'Instituição' }, { key: 'owner', label: 'Responsável' }],
  reunioes: [{ key: 'title', label: 'Título' }, { key: 'date', label: 'Data' }, { key: 'institution', label: 'Instituição' }, { key: 'decisions', label: 'Decisões' }],
};
const ENT_LABEL: Record<NotionEntity, string> = { tarefas: 'Tarefas', okrs: 'OKRs', reunioes: 'Reuniões' };

function ReviewRow({ item }: { item: ReviewQueueItem }) {
  const { settings } = useSettings();
  const { items: insts } = useInstitutions();
  const toast = useToast();
  const mapping = settings.notion_mapping[item.entity] ?? {};
  const props = item.payload as Record<string, string | null>;
  const [inst, setInst] = React.useState<string | null>(() => resolveInstitution(props[mapping.institution], insts));
  const needsDate = item.entity === 'reunioes' && !isoDate(props[mapping.date]);
  const [date, setDate] = React.useState('');
  async function approve() {
    if (!inst) return toast('Escolha a instituição antes de importar.', 'erro');
    if (needsDate && !isoDate(date)) return toast('Informe a data da reunião antes de importar.', 'erro');
    try { await importPage(item.entity, { id: item.external_id, properties: props }, mapping, inst, !!item.is_demo, needsDate ? { date } : {}); }
    catch (e) { return toast((e as Error).message, 'erro'); }
    await actions.update('review_queue', item.id, { resolved: true, resolution: 'importado' });
    await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity: item.entity, status: 'sucesso', message: `Item revisado e importado: ${item.title}`, is_demo_source: !!item.is_demo });
    toast('Item importado com a instituição escolhida.');
  }
  async function discard() {
    await actions.update('review_queue', item.id, { resolved: true, resolution: 'descartado' });
    toast('Item descartado (nada foi alterado no Notion).');
  }
  return (
    <li className={cn('grid items-end gap-3 rounded-lg border border-border p-3', needsDate ? 'sm:grid-cols-[1fr_200px_160px_auto]' : 'sm:grid-cols-[1fr_220px_auto]')}>
      <div><div className="font-semibold">{item.title} {item.is_demo && <DemoBadge />}</div><div className="text-xs text-muted">{ENT_LABEL[item.entity]} · {item.reason || 'Sem instituição reconhecida'}</div></div>
      <InstitutionSelect label="Atribuir instituição" value={inst} onChange={setInst} />
      {needsDate && <TextField label="Data da reunião" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />}
      <div className="flex gap-2"><Button size="sm" onClick={approve}>Importar</Button><Button size="sm" variant="ghost" onClick={discard}>Descartar</Button></div>
    </li>
  );
}

export default function Integracoes() {
  const { settings, save } = useSettings();
  const { items: insts } = useInstitutions();
  const logs = useCollection('sync_logs');
  const queue = useCollection('review_queue');
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [tab, setTab] = React.useState<'conexao' | 'mapeamento' | 'revisao' | 'log'>('conexao');
  const [syncing, setSyncing] = React.useState(false);
  const pending = queue.items.filter((q) => !q.resolved);

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
      const s = await syncRead(mockNotionAdapter, settings, insts);
      const t = Object.values(s).reduce((a, b) => ({ imported: a.imported + b.imported, review: a.review + b.review }), { imported: 0, review: 0 });
      toast(`Leitura concluída (demonstração): ${t.imported} importado(s), ${t.review} para revisão.`);
    } catch (e) { toast((e as Error).message, 'erro'); } finally { setSyncing(false); }
  }
  const setMap = (ent: NotionEntity, key: string, v: string) => save({ notion_mapping: { ...settings.notion_mapping, [ent]: { ...settings.notion_mapping[ent], [key]: v } } });

  return (
    <div>
      <PageHeader title="Integrações" subtitle="Notion via MCP — fase 1: somente leitura"
        actions={<Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: 'conexao', label: 'Conexão' }, { value: 'mapeamento', label: 'Campos' }, { value: 'revisao', label: `Revisão${pending.length ? ` (${pending.length})` : ''}` }, { value: 'log', label: 'Log' }]} />} />
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-orange/50 bg-orange/5 p-3 text-sm">
        <Info size={18} className="mt-0.5 shrink-0 text-orange" />
        <p><strong className="text-orange">Modo demonstração.</strong> A conexão usa um adaptador fictício. Nenhum workspace real do Notion é acessado e nenhum dado externo é alterado. Itens importados ficam marcados como demonstração.</p>
      </div>

      {tab === 'conexao' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-4 p-4">
            <div className="flex items-center gap-3"><Plug className="text-gold" /><div><h2 className="text-lg">Notion</h2><p className="text-xs text-muted">Adaptador: {mockNotionAdapter.kind === 'mock' ? 'Demonstração (mock)' : 'MCP'}</p></div>
              <span className={cn('chip ml-auto', settings.notion_enabled ? 'border-success/60 text-success' : 'border-border text-muted')}>{settings.notion_enabled ? <><CheckCircle2 size={12} />Leitura ativa</> : <><XCircle size={12} />Desativado</>}</span></div>
            <Checkbox label="Ativar leitura (tarefas, OKRs e reuniões)" checked={settings.notion_enabled} onChange={toggleEnabled} />
            <div className="rounded-lg border border-border p-3">
              <Checkbox label={<span className="flex items-center gap-1"><ShieldAlert size={14} className="text-danger" />Autorizar escrita no Notion (fase futura)</span>} checked={settings.notion_write_enabled} disabled={!settings.notion_enabled} onChange={toggleWrite} />
              <p className="mt-1 text-xs text-muted">Desativada por padrão. Mesmo ativada, cada escrita exigirá confirmação explícita. Nenhuma escrita está implementada nesta versão.</p>
            </div>
            <Button onClick={runSync} disabled={!settings.notion_enabled || syncing}><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Lendo…' : 'Sincronizar (somente leitura)'}</Button>
          </Card>
          <Card className="p-4 text-sm">
            <h2 className="mb-2 text-lg text-gold">Como funciona</h2>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Mapeie os nomes das propriedades do Notion para os campos do app.</li>
              <li>A leitura importa itens cuja instituição é reconhecida.</li>
              <li>Itens sem instituição vão para a fila de revisão — nunca são atribuídos automaticamente.</li>
              <li>Itens já importados (mesmo ID externo) são ignorados.</li>
              <li>Toda sincronização é registrada no log.</li>
            </ol>
          </Card>
        </div>
      )}

      {tab === 'mapeamento' && (
        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(FIELDS) as NotionEntity[]).map((ent) => (
            <Card key={ent} className="space-y-3 p-4">
              <h2 className="text-lg text-gold">{ENT_LABEL[ent]}</h2>
              {FIELDS[ent].map((f) => (
                <TextField key={f.key} label={`${f.label} ← propriedade do Notion`} defaultValue={settings.notion_mapping[ent]?.[f.key] ?? ''} onBlur={(e) => setMap(ent, f.key, e.target.value.trim())} />
              ))}
              <p className="text-xs text-muted">Salvo ao sair do campo.</p>
            </Card>
          ))}
        </div>
      )}

      {tab === 'revisao' && (queue.loading ? <Loading /> : pending.length === 0 ? <EmptyState title="Fila vazia" description="Itens sem instituição aparecerão aqui para revisão manual." /> : (
        <ul className="space-y-2">{pending.map((q) => <ReviewRow key={q.id} item={q} />)}</ul>
      ))}

      {tab === 'log' && (logs.loading ? <Loading /> : logs.items.length === 0 ? <EmptyState title="Sem registros" description="As sincronizações aparecerão aqui." /> : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="p-3">Quando</th><th className="p-3">Entidade</th><th className="p-3">Status</th><th className="p-3">Mensagem</th></tr></thead>
            <tbody>
              {[...logs.items].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-3 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                  <td className="p-3">{ENT_LABEL[l.entity as NotionEntity] ?? l.entity} {l.is_demo_source && <DemoBadge />}</td>
                  <td className={cn('p-3', l.status === 'erro' ? 'text-danger' : l.status === 'revisao' ? 'text-orange' : 'text-success')}>{l.status === 'erro' ? 'Erro' : l.status === 'revisao' ? 'Com revisão' : 'Sucesso'}</td>
                  <td className="p-3">{l.message}</td>
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
