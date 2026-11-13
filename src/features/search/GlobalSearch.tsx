import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/misc';
import { fmtDate, todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';
import { dueText, isOpen } from '@/features/tasks/taskLogic';
import { search, type SearchDoc } from './searchIndex';

/**
 * Busca em tudo: tarefas, pessoas, reuniões, agenda, OKRs, projetos, treinamentos e anotações.
 * Respeita a instituição escolhida no topo. Feedbacks ficam de fora (podem ser restritos por PIN).
 * Atalho: Ctrl+K (ou ⌘K). Setas ↑/↓ escolhem, Enter abre.
 */
export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Buscar em tudo (Ctrl+K)" title="Buscar em tudo (Ctrl+K)" onClick={() => setOpen(true)}><Search size={18} /></Button>
      <Dialog open={open} onOpenChange={setOpen} title="Buscar em tudo" description="Tarefas, pessoas, reuniões, agenda, OKRs, projetos, treinamentos e anotações.">
        {open && <SearchPanel onClose={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { scope, matches, matchesItem } = useScope();
  const tasks = useCollection('tasks');
  const people = useCollection('people');
  const meetings = useCollection('meetings');
  const events = useCollection('agenda_events');
  const objectives = useCollection('objectives');
  const projects = useCollection('projects');
  const trainings = useCollection('trainings');
  const notes = useCollection('notes');
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const loading = [tasks, people, meetings, events, objectives].some((c) => c.loading);
  const today = todayISO();

  const docs = React.useMemo<SearchDoc[]>(() => [
    ...tasks.items.filter((t) => matchesItem(t)).map((t) => ({ group: 'Tarefas' as const, id: t.id, title: t.title,
      subtitle: !isOpen(t) ? 'Concluída' : t.due_date ? dueText(t.due_date, today).text : 'Sem prazo', extra: t.description, to: `/tarefas?tarefa=${t.id}` })),
    ...people.items.filter((p) => matches(p.institution_ids)).map((p) => ({ group: 'Pessoas' as const, id: p.id, title: p.name, subtitle: p.role, extra: `${p.email} ${p.notes}`, to: `/equipes/${p.id}` })),
    ...meetings.items.filter((m) => matches(m.institution_id)).map((m) => ({ group: 'Reuniões' as const, id: m.id, title: m.title, subtitle: fmtDate(m.date), extra: `${m.agenda} ${m.decisions}`, to: `/reunioes?reuniao=${m.id}` })),
    ...events.items.filter((e) => matches(e.institution_id)).map((e) => ({ group: 'Agenda' as const, id: e.id, title: e.title, subtitle: `${fmtDate(e.date)} · ${e.start}`, extra: `${e.location} ${e.notes}`, to: `/agenda?data=${e.date}` })),
    ...objectives.items.filter((o) => matchesItem(o)).flatMap((o) => [
      { group: 'OKRs' as const, id: o.id, title: o.title, subtitle: `Objetivo · ${o.key_results.length} ${o.key_results.length === 1 ? 'KR' : 'KRs'}`, extra: o.owner, to: `/okrs?objetivo=${o.id}` },
      ...o.key_results.map((k) => ({ group: 'OKRs' as const, id: `${o.id}:${k.id}`, title: k.title, subtitle: `KR · ${o.title}`, extra: `${k.description ?? ''} ${k.reason ?? ''}`, to: `/okrs?objetivo=${o.id}` })),
    ]),
    ...projects.items.filter((p) => matches(p.institution_id)).map((p) => ({ group: 'Projetos' as const, id: p.id, title: p.name, to: '/projetos' })),
    ...trainings.items.filter((t) => matches(t.institution_id)).map((t) => ({ group: 'Treinamentos' as const, id: t.id, title: t.title, subtitle: t.date ? fmtDate(t.date) : undefined, to: '/treinamentos' })),
    ...notes.items.map((n) => ({ group: 'Anotações' as const, id: n.id, title: n.text.length > 90 ? `${n.text.slice(0, 90)}…` : n.text, subtitle: `Anotação de ${fmtDate(n.date)}`, extra: n.text, to: n.date === today ? '/' : undefined })),
  ], [tasks.items, people.items, meetings.items, events.items, objectives.items, projects.items, trainings.items, notes.items, matches, matchesItem, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = React.useMemo(() => search(docs, q), [docs, q]);
  const flat = groups.flatMap((g) => g.hits);
  React.useEffect(() => setActive(0), [q]);
  const go = (to?: string) => { if (!to) return; onClose(); navigate(to); };

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]?.to); }
  }

  let i = -1;
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <label htmlFor="busca-global" className="sr-only">Buscar</label>
        <input id="busca-global" autoFocus className="field pl-9" placeholder="Digite pelo menos 2 letras…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          role="combobox" aria-expanded={flat.length > 0} aria-controls="busca-global-resultados" aria-activedescendant={flat[active] ? `busca-${flat[active].group}-${flat[active].id}` : undefined} />
      </div>
      {scope !== 'all' && <p className="text-xs text-muted">Buscando só na instituição escolhida no topo.</p>}
      {loading && q ? <Loading /> : q.trim().length >= 2 && flat.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nada encontrado para “{q.trim()}”.</p>
      ) : (
        <div id="busca-global-resultados" role="listbox" aria-label="Resultados" className="max-h-[55vh] space-y-3 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.group}>
              <p className="mb-1 px-1 text-xs font-medium text-muted">{g.group}</p>
              <ul className="space-y-0.5">
                {g.hits.map((h) => {
                  i++; const on = i === active; const idx = i;
                  return (
                    <li key={h.id} id={`busca-${h.group}-${h.id}`} role="option" aria-selected={on}>
                      <button type="button" disabled={!h.to} onMouseEnter={() => setActive(idx)} onClick={() => go(h.to)}
                        className={cn('w-full rounded-lg px-3 py-2 text-left transition', on ? 'bg-surface-3' : 'hover:bg-surface-2', !h.to && 'cursor-default')}>
                        <div className="text-sm [overflow-wrap:anywhere]">{h.title}</div>
                        {h.subtitle && <div className="text-xs text-muted">{h.subtitle}</div>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
