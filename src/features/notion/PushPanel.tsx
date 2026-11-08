import * as React from 'react';
import { Link } from 'react-router-dom';
import { Send, ShieldAlert } from 'lucide-react';
import { useCollection } from '@/data/store';
import { useSettings } from '@/app/hooks';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DemoBadge } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { resolveNotionConfig } from '@/integrations/notion/config';
import { pendingPushes, pushToNotion, type PendingChange } from '@/integrations/notion/push';
import { notionWriter } from './connection';

/** Alterações feitas na Central em itens do Notion que ainda não foram enviadas. */
export function usePendingPushes(entity?: 'tarefas' | 'krs') {
  const states = useCollection('notion_sync_state');
  const tasks = useCollection('tasks');
  const objectives = useCollection('objectives');
  const all = React.useMemo(() => pendingPushes(states.items, tasks.items, objectives.items, notionWriter.isDemo),
    [states.items, tasks.items, objectives.items]);
  return { pending: entity ? all.filter((p) => p.entity === entity) : all, reload: () => Promise.all([states.reload(), tasks.reload(), objectives.reload()]), objectives: objectives.items };
}

/**
 * Confirmação explícita do envio ao Notion: mostra cada campo (Notion hoje → valor da Central), deixa desmarcar
 * itens e só envia quando a pessoa clica em "Enviar". Sem a escrita autorizada, o botão fica bloqueado.
 */
export function PushDialog({ open, onOpenChange, entity }: { open: boolean; onOpenChange: (o: boolean) => void; entity?: 'tarefas' | 'krs' }) {
  const { settings } = useSettings();
  const { pending, reload, objectives } = usePendingPushes(entity);
  const queue = useCollection('review_queue');
  const logs = useCollection('sync_logs');
  const toast = useToast();
  const [skip, setSkip] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setSkip(new Set()); }, [open]);
  const chosen = pending.filter((p) => !skip.has(p.state.id));
  const allowed = settings.notion_enabled && settings.notion_write_enabled;

  async function send() {
    setBusy(true);
    try {
      const s = await pushToNotion(notionWriter, chosen, resolveNotionConfig(settings), objectives);
      await Promise.all([reload(), queue.reload(), logs.reload()]);
      const parts = [`${s.enviados} enviada(s)`];
      if (s.conflitos) parts.push(`${s.conflitos} em conflito (veja Integrações → Conflitos)`);
      if (s.recusados + s.erros) parts.push(`${s.recusados + s.erros} não enviada(s)`);
      toast(`Notion${notionWriter.isDemo ? ' (demonstração)' : ''}: ${parts.join(', ')}.${s.mensagens.length ? ` ${s.mensagens[0]}` : ''}`, s.recusados + s.erros ? 'erro' : undefined);
      onOpenChange(false);
    } catch (e) { toast((e as Error).message, 'erro'); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Enviar alterações ao Notion" badge={notionWriter.isDemo ? <DemoBadge /> : undefined}
      description="Confira o que será alterado no Notion. Só os campos abaixo mudam; nada é criado ou apagado."
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={send} disabled={busy || !allowed || chosen.length === 0}><Send size={15} />{busy ? 'Enviando…' : `Enviar ${chosen.length} ao Notion`}</Button>
      </>}>
      {!allowed && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-danger/50 p-3 text-sm text-danger">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>A escrita no Notion está desativada. Ative <strong>Autorizar escrita no Notion</strong> em <Link className="underline" to="/integracoes" onClick={() => onOpenChange(false)}>Integrações</Link> para poder enviar.</span>
        </p>
      )}
      {pending.length === 0 ? <p className="text-sm text-muted">Nenhuma alteração pendente: a Central e o Notion estão iguais.</p> : (
        <ul className="space-y-2">
          {pending.map((p) => <PendingRow key={p.state.id} p={p} on={!skip.has(p.state.id)}
            toggle={() => setSkip((s) => { const n = new Set(s); if (n.has(p.state.id)) n.delete(p.state.id); else n.add(p.state.id); return n; })} />)}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Se o mesmo campo tiver mudado no Notion desde a última sincronização, ele NÃO é sobrescrito: vira um conflito para você decidir.</p>
    </Dialog>
  );
}

function PendingRow({ p, on, toggle }: { p: PendingChange; on: boolean; toggle: () => void }) {
  return (
    <li className={cn('rounded-lg border p-3 text-sm', on ? 'border-gold-300/40' : 'border-border opacity-60')}>
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--gold-300))]" checked={on} onChange={toggle} aria-label={`Enviar ${p.title}`} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{p.title}</span> <span className="text-xs text-muted">· {p.entity === 'krs' ? 'KR' : 'Tarefa'}</span>
          <ul className="mt-1 space-y-0.5 text-xs">
            {p.changes.map((c) => <li key={c.field}><span className="text-muted">{c.label}:</span> <span className="line-through decoration-muted/60">{c.from}</span> → <strong className="text-gold">{c.to}</strong></li>)}
          </ul>
        </span>
      </label>
    </li>
  );
}

/** Aviso compacto com o botão que abre a confirmação. Some quando não há nada pendente. */
export function PushBanner({ entity, className }: { entity?: 'tarefas' | 'krs'; className?: string }) {
  const { pending } = usePendingPushes(entity);
  const [open, setOpen] = React.useState(false);
  if (!pending.length) return null;
  return (
    <>
      <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-300/40 bg-gold-300/[.05] p-3 text-sm', className)}>
        <span><strong className="text-gold">{pending.length}</strong> alteração(ões) feitas aqui ainda não estão no Notion.</span>
        <Button size="sm" onClick={() => setOpen(true)}><Send size={14} />Revisar e enviar ao Notion</Button>
      </div>
      <PushDialog open={open} onOpenChange={setOpen} entity={entity} />
    </>
  );
}
