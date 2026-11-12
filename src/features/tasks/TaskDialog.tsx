import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, FormSection, useConfirm } from '@/components/ui/dialog';
import { NotionBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { TASK_ATTRIBUTION_OPTIONS, sortAttribution } from '@/integrations/notion/config';
import { InstitutionSelect } from '@/components/domain/Institution';
import { isFromNotion } from '@/integrations/notion/mapping';
import { PRIORITY, RECURRENCE, TASK_STATUS, toOptions } from '@/domain/labels';
import type { Task } from '@/domain/types';
import { actions } from '@/data/store';
import { useSettings } from '@/app/hooks';
import { useToast } from '@/components/ui/toast';
import { emptyTask, withHistory } from './taskLogic';
import { setTaskStatus } from './actions';
import { fmtDateTime } from '@/lib/time';
import { uid } from '@/lib/utils';

type Draft = Omit<Task, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export function TaskDialog({ open, onOpenChange, task, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; task?: Task | null; defaults?: Partial<Task> }) {
  const { d, set, err, setErr } = useDraft<Draft>(open, () => (task ? { ...task } : { ...emptyTask(), ...defaults }), [task]);
  const [saving, setSaving] = React.useState(false);
  const [newItem, setNewItem] = React.useState('');
  const { settings } = useSettings();
  const toast = useToast();
  const { confirmDelete, confirmNode } = useConfirm();
  const remove = () => task && confirmDelete('Excluir tarefa', `“${task.title}”`, async () => {
    try { await actions.remove('tasks', task.id); toast('Tarefa excluída.'); onOpenChange(false); } catch (e) { toast((e as Error).message, 'erro'); }
  });

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const er: Record<string, string> = {};
    if (!d.title.trim()) er.title = 'Informe o título.';
    if (d.recurrence !== 'nenhuma' && !d.due_date) er.due_date = 'Tarefas recorrentes precisam de prazo.';
    setErr(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      if (task) {
        const changed = (['title', 'priority', 'due_date', 'institution_id', 'recurrence'] as const).filter((k) => (task as any)[k] !== (d as any)[k]);
        const { status, completed_at: _c, ...fields } = d;
        await setTaskStatus(task, status, { ...fields, title: d.title.trim(), history: changed.length ? withHistory(task, 'Editada', `Campos: ${changed.join(', ')}`) : task.history });
        toast('Tarefa atualizada.');
      } else {
        await actions.create('tasks', { ...d, title: d.title.trim(), completed_at: d.status === 'concluida' ? new Date().toISOString() : null, history: withHistory({ history: [] }, 'Criada') });
        toast('Tarefa criada.');
      }
      onOpenChange(false);
    } catch (e) { toast((e as Error).message, 'erro'); } finally { setSaving(false); }
  }

  const done = d.checklist.filter((c) => c.done).length;
  const addItem = () => { if (newItem.trim()) { set('checklist', [...d.checklist, { id: uid(), text: newItem.trim(), done: false }]); setNewItem(''); } };

  const notion = !!task && isFromNotion(task);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={task ? 'Editar tarefa' : 'Nova tarefa'} wide
      badge={notion ? <NotionBadge /> : undefined}
      description={task ? `Criada em ${fmtDateTime(task.created_at)}` : 'Preencha o essencial; o resto é opcional.'}
      footer={<>
        {task && <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={remove}><Trash2 size={15} />Excluir</Button>}
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar tarefa'}</Button></>}>
      <form onSubmit={save} className="space-y-7">
        {notion && <p className="panel px-3 py-2.5 text-xs text-muted">Sincronizada do Notion. Título, status, prioridade e prazo alterados aqui ficam marcados como pendentes de envio — o envio ao Notion é uma fase futura.</p>}
        <FormSection title="Essencial">
          <TextField label="Título" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} autoFocus placeholder="O que precisa ser feito?" />
          {notion
            ? <TextArea label="Descrição (conteúdo da página no Notion)" readOnly rows={Math.min(14, Math.max(3, (d.description || '').split('\n').length + 1))}
                value={d.description || ''} placeholder="A página no Notion não tem conteúdo."
                hint="Somente leitura: vem de dentro da página no Notion. Edite lá; a Central atualiza na próxima sincronização." />
            : <TextArea label="Descrição" rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="Contexto, links, próximos passos…" />}
        </FormSection>
        <FormSection title="Classificação">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Status" value={d.status} onChange={(e) => set('status', e.target.value as any)} options={toOptions(TASK_STATUS)} />
            <SelectField label="Prioridade" value={d.priority} onChange={(e) => set('priority', e.target.value as any)} options={Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))} />
            <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
            <SelectField label="Categoria" value={d.category} onChange={(e) => set('category', e.target.value)} options={[...new Set([...settings.categories, d.category])].map((c) => ({ value: c, label: c }))} />
            <fieldset className="sm:col-span-2">
              <legend className="label mb-1.5">Atribuição (como no Notion)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {TASK_ATTRIBUTION_OPTIONS.map((a) => {
                  const cur = sortAttribution(d.attribution);
                  return <Checkbox key={a} label={a} checked={cur.includes(a)} onChange={(v) => set('attribution', sortAttribution(v ? [...cur, a] : cur.filter((x) => x !== a)))} />;
                })}
              </div>
            </fieldset>
          </div>
        </FormSection>
        <FormSection title="Prazo e repetição">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Prazo" type="date" value={d.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} error={err.due_date} />
            <SelectField label="Recorrência" value={d.recurrence} onChange={(e) => set('recurrence', e.target.value as any)} options={toOptions(RECURRENCE)} hint="Ao concluir, a próxima ocorrência é criada." />
          </div>
        </FormSection>
        <FormSection title={`Checklist${d.checklist.length > 0 ? ` · ${done}/${d.checklist.length}` : ''}`}>
          {d.checklist.length > 0 && (
            <ul className="space-y-1">
              {d.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-2">
                  <Checkbox label={<span className={c.done ? 'text-muted line-through' : ''}>{c.text}</span>} checked={c.done} onChange={(v) => set('checklist', d.checklist.map((x) => x.id === c.id ? { ...x, done: v } : x))} className="flex-1" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remover item ${c.text}`} onClick={() => set('checklist', d.checklist.filter((x) => x.id !== c.id))}><Trash2 size={14} /></Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input aria-label="Novo item do checklist" className="field" value={newItem} placeholder="Adicionar item e pressionar Enter…" onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
            <Button variant="secondary" size="icon" className="h-10 w-10 shrink-0" aria-label="Adicionar item" onClick={addItem}><Plus size={16} /></Button>
          </div>
        </FormSection>
        {task && task.history?.length > 0 && (
          <details className="panel px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Histórico ({task.history.length})</summary>
            <ol className="mt-3 space-y-1.5 border-l border-border pl-3 text-xs text-muted">
              {[...task.history].reverse().map((h, i) => <li key={i}><span className="text-fg/90">{fmtDateTime(h.at)}</span> — {h.action}{h.detail ? ` · ${h.detail}` : ''}</li>)}
            </ol>
          </details>
        )}
        <button type="submit" className="hidden" />
      </form>
      {confirmNode}
    </Dialog>
  );
}
