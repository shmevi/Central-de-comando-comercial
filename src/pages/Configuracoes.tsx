import * as React from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { actions, useCollection, resetStore } from '@/data/store';
import { useInstitutions, useSettings } from '@/app/hooks';
import { useAuth } from '@/app/auth';
import { PageHeader, Card, Segmented } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { repo, DATA_MODE } from '@/data';
import { localClearAll } from '@/data/localRepository';
import { seedDemo, removeDemo } from '@/data/seed';
import { COLLECTIONS, type RoutineTemplateBlock } from '@/domain/types';
import { effectiveMinutes } from '@/lib/workday';
import { fmtDuration, toMin, WEEKDAYS } from '@/lib/time';
import { uid } from '@/lib/utils';
import { download } from '@/features/reports/build';

function Section({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card className="p-4"><h2 className="text-lg text-gold">{title}</h2>{description && <p className="mb-3 text-xs text-muted">{description}</p>}<div className="mt-3 space-y-3">{children}</div></Card>;
}

function Institutions() {
  const { items } = useInstitutions();
  const tasks = useCollection('tasks');
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [name, setName] = React.useState('');
  return (
    <Section title="Instituições" description="Os dados de cada instituição nunca são misturados. Desative em vez de excluir para preservar o histórico.">
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2">
            <label className="flex-1 min-w-[160px]"><span className="sr-only">Nome de {i.name}</span><input className="field" defaultValue={i.name} onBlur={(e) => e.target.value.trim() && e.target.value !== i.name && actions.update('institutions', i.id, { name: e.target.value.trim() })} /></label>
            <label><span className="sr-only">Cor de {i.name}</span><input type="color" className="h-9 w-12 rounded border border-border bg-transparent" value={i.color} onChange={(e) => actions.update('institutions', i.id, { color: e.target.value })} /></label>
            <Checkbox label="Ativa" checked={i.active} onChange={(v) => actions.update('institutions', i.id, { active: v })} />
            <Button variant="ghost" size="icon" aria-label={`Excluir ${i.name}`} onClick={async () => {
              const n = tasks.items.filter((t) => t.institution_id === i.id).length;
              if (n) return toast(`Há ${n} tarefa(s) vinculadas. Desative a instituição em vez de excluir.`, 'erro');
              if (await confirm({ title: 'Excluir instituição', message: `Excluir “${i.name}”?`, danger: true, confirmLabel: 'Excluir' })) actions.remove('institutions', i.id);
            }}><Trash2 size={15} /></Button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await actions.create('institutions', { code: name.trim().toUpperCase().replace(/\W+/g, '_'), name: name.trim(), color: '#A39E92', active: true }); setName(''); }}>
        <label className="flex-1"><span className="sr-only">Nova instituição</span><input className="field" placeholder="Nova instituição…" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <Button type="submit" variant="secondary"><Plus size={16} />Adicionar</Button>
      </form>
      {confirmNode}
    </Section>
  );
}

function RoutineTemplateEditor() {
  const templates = useCollection('routine_templates');
  const toast = useToast();
  const tpl = templates.items.find((t) => t.is_default) ?? templates.items[0];
  const [blocks, setBlocks] = React.useState<RoutineTemplateBlock[]>([]);
  React.useEffect(() => { if (tpl) setBlocks(tpl.blocks); }, [tpl?.id, tpl?.updated_at]); // eslint-disable-line
  if (!tpl) return null;
  const set = (id: string, patch: Partial<RoutineTemplateBlock>) => setBlocks((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  async function save() {
    if (blocks.some((b) => !b.title.trim() || !b.start || !b.end || toMin(b.end) <= toMin(b.start))) return toast('Revise os blocos: título e horários válidos.', 'erro');
    await actions.update('routine_templates', tpl!.id, { blocks: [...blocks].sort((a, b) => a.start.localeCompare(b.start)) });
    toast('Modelo salvo. Vale para os próximos dias gerados.');
  }
  return (
    <Section title="Modelo de rotina" description="Rotina-base usada para gerar cada dia útil. Dias já gerados não mudam.">
      <ul className="space-y-2">
        {blocks.map((b) => (
          <li key={b.id} className="grid grid-cols-[90px_90px_1fr_auto] items-center gap-2">
            <label><span className="sr-only">Início</span><input type="time" className="field px-2" value={b.start} onChange={(e) => set(b.id, { start: e.target.value })} /></label>
            <label><span className="sr-only">Fim</span><input type="time" className="field px-2" value={b.end} onChange={(e) => set(b.id, { end: e.target.value })} /></label>
            <label><span className="sr-only">Título</span><input className="field" value={b.title} disabled={b.is_break} onChange={(e) => set(b.id, { title: e.target.value })} /></label>
            <Button variant="ghost" size="icon" disabled={b.is_break} aria-label={`Remover ${b.title}`} onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}><Trash2 size={14} /></Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setBlocks([...blocks, { id: uid(), start: '', end: '', title: '', category: 'Geral' }])}><Plus size={14} />Bloco</Button>
        <Button size="sm" onClick={save}>Salvar modelo</Button>
      </div>
    </Section>
  );
}

export default function Configuracoes() {
  const { settings, save, workday } = useSettings();
  const { email, mode } = useAuth();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [cat, setCat] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const eff = effectiveMinutes(workday);

  async function exportBackup() {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), version: 1 };
    for (const c of COLLECTIONS) out[c] = await repo(c).list();
    download(`central-comando-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), 'application/json');
  }
  async function importBackup(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1) throw new Error('Arquivo de backup inválido.');
      if (!(await confirm({ title: 'Importar backup', message: 'Os registros do arquivo serão ADICIONADOS aos atuais (registros com o mesmo ID são ignorados). Continuar?', confirmLabel: 'Importar' }))) return;
      let n = 0;
      for (const c of COLLECTIONS) {
        if (c === 'settings' || !Array.isArray(data[c])) continue;
        const ids = new Set((await repo(c).list()).map((x) => x.id));
        for (const item of data[c]) { if (!ids.has(item.id)) { const { created_at: _a, updated_at: _b, user_id: _u, ...rest } = item; await repo(c).create(rest); n++; } }
      }
      resetStore(); toast(`${n} registro(s) importado(s).`);
    } catch (e) { toast((e as Error).message, 'erro'); }
  }

  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Perfil e aparência">
          <TextField label="Como devo chamar você?" defaultValue={settings.display_name} onBlur={(e) => e.target.value.trim() && save({ display_name: e.target.value.trim() })} />
          <div><span className="label">Tema</span>
            <Segmented label="Tema" value={settings.theme} onChange={(v) => save({ theme: v })} options={[{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'system', label: 'Sistema' }]} /></div>
        </Section>

        <Section title="Jornada" description="Segunda a sexta. Sem expediente aos sábados e domingos.">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Início" type="time" value={settings.workday_start} onChange={(e) => save({ workday_start: e.target.value })} />
            <TextField label="Fim" type="time" value={settings.workday_end} onChange={(e) => save({ workday_end: e.target.value })} />
            <TextField label="Início do intervalo" type="time" value={settings.break_start} onChange={(e) => save({ break_start: e.target.value })} />
            <TextField label="Fim do intervalo" type="time" value={settings.break_end} onChange={(e) => save({ break_end: e.target.value })} />
          </div>
          <p className="text-sm">Carga efetiva: <strong className="text-gold">{fmtDuration(eff)}</strong> por dia ({eff} min) · <strong className="text-gold">{fmtDuration(eff * 5)}</strong> por semana{eff !== 528 && <span className="text-orange"> — difere do padrão 8h48</span>}</p>
        </Section>

        <Institutions />

        <Section title="Foco por dia da semana">
          {[1, 2, 3, 4, 5].map((d) => (
            <TextField key={d} label={WEEKDAYS[d]} defaultValue={settings.weekly_focus[String(d)] ?? ''} onBlur={(e) => save({ weekly_focus: { ...settings.weekly_focus, [String(d)]: e.target.value } })} />
          ))}
        </Section>

        <Section title="Categorias">
          <ul className="flex flex-wrap gap-2">{settings.categories.map((c) => (
            <li key={c} className="chip border-border">{c}<button type="button" aria-label={`Remover categoria ${c}`} className="ml-1 text-muted hover:text-danger" onClick={() => save({ categories: settings.categories.filter((x) => x !== c) })}>×</button></li>
          ))}</ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = cat.trim(); if (v && !settings.categories.includes(v)) save({ categories: [...settings.categories, v] }); setCat(''); }}>
            <label className="flex-1"><span className="sr-only">Nova categoria</span><input className="field" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Nova categoria…" /></label>
            <Button type="submit" variant="secondary"><Plus size={16} /></Button>
          </form>
        </Section>

        <RoutineTemplateEditor />

        <Section title="Usuários e permissões" description="Cada usuário só acessa os próprios dados (RLS no Supabase).">
          <p className="text-sm">Modo de persistência: <strong>{mode === 'supabase' ? 'Supabase (autenticado)' : 'Local — somente neste navegador'}</strong>{email && <> · {email}</>}</p>
          <Checkbox label="Restringir acesso aos feedbacks" checked={settings.permissions.feedbacks_restricted} onChange={(v) => save({ permissions: { ...settings.permissions, feedbacks_restricted: v } })} />
          <TextField label="PIN para abrir feedbacks" type="password" inputMode="numeric" defaultValue={settings.permissions.feedback_pin} hint="Camada extra na interface. A proteção real dos dados é a autenticação + RLS."
            onBlur={(e) => save({ permissions: { ...settings.permissions, feedback_pin: e.target.value } })} />
        </Section>

        <Section title="Dados" description="Dados de demonstração são marcados e podem ser removidos a qualquer momento.">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={async () => { await seedDemo(); toast('Dados de demonstração adicionados.'); }}>Carregar demonstração</Button>
            <Button variant="danger" size="sm" onClick={async () => { if (await confirm({ title: 'Remover demonstração', message: 'Remover todos os registros marcados como demonstração?', danger: true, confirmLabel: 'Remover' })) { await removeDemo(); toast('Dados de demonstração removidos.'); } }}>Remover demonstração</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={exportBackup}><Download size={14} />Exportar backup (JSON)</Button>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} />Importar backup</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" aria-label="Arquivo de backup" onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; }} />
          </div>
          {DATA_MODE === 'local' && (
            <Button variant="danger" size="sm" onClick={async () => { if (await confirm({ title: 'Apagar dados locais', message: 'Apagar TODOS os dados salvos neste navegador e recomeçar? Exporte um backup antes.', danger: true, confirmLabel: 'Apagar tudo' })) { localClearAll(); location.reload(); } }}>Apagar dados locais</Button>
          )}
          <SelectField label="Fuso horário" value="America/Recife" disabled onChange={() => {}} options={[{ value: 'America/Recife', label: 'America/Recife (UTC−3)' }]} />
        </Section>
      </div>
      {confirmNode}
    </div>
  );
}
