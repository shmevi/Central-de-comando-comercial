import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionSelect } from '@/components/domain/Institution';
import { PRIORITY, RECURRENCE, TASK_STATUS, toOptions } from '@/domain/labels';
import type { Task } from '@/domain/types';
import { actions } from '@/data/store';
import { useSettings } from '@/app/hooks';
import { useToast } from '@/components/ui/toast';
import { emptyTask, withHistory } from './taskLogic';
import { fmtDateTime } from '@/lib/time';
import { uid } from '@/lib/utils';

type Draft = Omit<Task, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export function TaskDialog({ open, onOpenChange, task, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; task?: Task | null; defaults?: Partial<Task> }) {
  const [d, setD] = React.useState<Draft>(emptyTask());
  const [err, setErr] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [newItem, setNewItem] = React.useState('');
  const { settings } = useSettings();
  const toast = useToast();

  React.useEffect(() => { if (open) { setD(task ? { ...task } : { ...emptyTask(), ...defaults }); setErr({}); } }, [open, task]); // eslint-disable-line

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

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
        const changed = (['title', 'status', 'priority', 'due_date', 'institution_id'] as const).filter((k) => (task as any)[k] !== (d as any)[k]);
        await actions.update('tasks', task.id, { ...d, title: d.title.trim(), history: changed.length ? withHistory(task, 'Editada', `Campos: ${changed.join(', ')}`) : task.history });
        toast('Tarefa atualizada.');
      } else {
        await actions.create('tasks', { ...d, title: d.title.trim(), history: withHistory({ history: [] }, 'Criada') });
        toast('Tarefa criada.');
      }
      onOpenChange(false);
    } catch (e) { toast((e as Error).message, 'erro'); } finally { setSaving(false); }
  }

  const done = d.checklist.filter((c) => c.done).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={task ? 'Editar tarefa' : 'Nova tarefa'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Título" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} autoFocus />
        <TextArea className="sm:col-span-2" label="Descrição" value={d.description} onChange={(e) => set('description', e.target.value)} />
        <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
        <SelectField label="Categoria" value={d.category} onChange={(e) => set('category', e.target.value)} options={settings.categories.map((c) => ({ value: c, label: c }))} />
        <SelectField label="Prioridade" value={d.priority} onChange={(e) => set('priority', e.target.value as any)} options={Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))} />
        <SelectField label="Status" value={d.status} onChange={(e) => set('status', e.target.value as any)} options={toOptions(TASK_STATUS)} />
        <TextField label="Prazo" type="date" value={d.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} error={err.due_date} />
        <SelectField label="Recorrência" value={d.recurrence} onChange={(e) => set('recurrence', e.target.value as any)} options={toOptions(RECURRENCE)} hint="Ao concluir, a próxima ocorrência é criada." />
        <fieldset className="sm:col-span-2">
          <legend className="label">Checklist {d.checklist.length > 0 && `(${done}/${d.checklist.length})`}</legend>
          <ul className="mb-2 space-y-1">
            {d.checklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Checkbox label={<span className={c.done ? 'line-through text-muted' : ''}>{c.text}</span>} checked={c.done} onChange={(v) => set('checklist', d.checklist.map((x) => x.id === c.id ? { ...x, done: v } : x))} className="flex-1" />
                <Button variant="ghost" size="icon" aria-label={`Remover item ${c.text}`} onClick={() => set('checklist', d.checklist.filter((x) => x.id !== c.id))}><Trash2 size={14} /></Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input aria-label="Novo item do checklist" className="field" value={newItem} placeholder="Adicionar item…" onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newItem.trim()) { set('checklist', [...d.checklist, { id: uid(), text: newItem.trim(), done: false }]); setNewItem(''); } } }} />
            <Button variant="secondary" size="icon" aria-label="Adicionar item" onClick={() => { if (newItem.trim()) { set('checklist', [...d.checklist, { id: uid(), text: newItem.trim(), done: false }]); setNewItem(''); } }}><Plus size={16} /></Button>
          </div>
        </fieldset>
        {task && task.history?.length > 0 && (
          <details className="sm:col-span-2 rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Histórico ({task.history.length})</summary>
            <ol className="mt-2 space-y-1 text-xs text-muted">
              {[...task.history].reverse().map((h, i) => <li key={i}><span className="text-fg">{fmtDateTime(h.at)}</span> — {h.action}{h.detail ? ` · ${h.detail}` : ''}</li>)}
            </ol>
          </details>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
