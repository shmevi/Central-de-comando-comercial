import * as React from 'react';
import { Download, ImagePlus, Plus, Trash2, Upload } from 'lucide-react';
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
import { effectiveMinutes, validateWorkday } from '@/lib/workday';
import { fmtDuration, toMin, WEEKDAYS } from '@/lib/time';
import { uid } from '@/lib/utils';
import { hashPin } from '@/lib/pin';
import { download } from '@/features/reports/build';
import { LOGO_ACCEPT, LOGO_MAX_BYTES, LOGO_MAX_BYTES_LOCAL, fmtLimit, removeLogoFile, uploadLogo } from '@/data/branding';
import { BrandLogo, useBrandLogo } from '@/components/layout/BrandLogo';

function Section({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

/** Logo personalizada da Central (Supabase Storage no modo Supabase; navegador no modo local). */
function LogoSection() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const url = useBrandLogo();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const current = settings.logo_path ?? null;
  async function choose(file: File) {
    setBusy(true);
    try {
      const path = await uploadLogo(file);
      await save({ logo_path: path });
      if (current && current !== path) await removeLogoFile(current).catch(() => { /* arquivo antigo: não crítico */ });
      toast('Logo atualizada.');
    } catch (e) { toast((e as Error).message, 'erro'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!(await confirm({ title: 'Remover logo personalizada', message: 'A Central volta a usar o monograma CP. Continuar?', confirmLabel: 'Remover', danger: true }))) return;
    setBusy(true);
    try { await save({ logo_path: null }); await removeLogoFile(current).catch(() => {}); toast('Logo personalizada removida.'); }
    catch (e) { toast((e as Error).message, 'erro'); } finally { setBusy(false); }
  }
  return (
    <Section title="Identidade visual" description={DATA_MODE === 'supabase' ? 'A logo fica no Supabase Storage (pasta privada da sua conta) e aparece em todos os seus dispositivos.' : 'Modo local: a logo fica salva só neste navegador.'}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/70 bg-surface-2" aria-label="Prévia da logo">
          {url ? <img src={url} alt="Prévia da logo personalizada" className="h-full w-full object-contain" /> : <BrandLogo size={56} />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm">{url ? 'Logo personalizada em uso.' : 'Usando o monograma padrão “CP”.'}</p>
          <p className="text-xs text-muted">PNG, JPG/JPEG ou WEBP · até {fmtLimit(DATA_MODE === 'supabase' ? LOGO_MAX_BYTES : LOGO_MAX_BYTES_LOCAL)} · de preferência quadrada.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus size={14} />{busy ? 'Enviando…' : 'Escolher imagem'}</Button>
            {current && <Button size="sm" variant="ghost" disabled={busy} onClick={remove}><Trash2 size={14} />Remover logo personalizada</Button>}
          </div>
          <input ref={inputRef} type="file" accept={LOGO_ACCEPT} className="hidden" aria-label="Arquivo da logo"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ''; }} />
        </div>
      </div>
      {confirmNode}
    </Section>
  );
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

function PinField() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const [pin, setPin] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const has = !!settings.permissions.feedback_pin;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return setErr('Use de 4 a 8 dígitos.');
    setErr(null);
    await save({ permissions: { ...settings.permissions, feedback_pin: await hashPin(pin) } });
    setPin(''); toast('PIN salvo (apenas o hash é armazenado).');
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <TextField label={has ? 'Trocar PIN dos feedbacks' : 'Definir PIN dos feedbacks'} type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} error={err}
        hint="Camada extra na interface. A proteção real dos dados é a autenticação + RLS." />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary">Salvar PIN</Button>
        {has && <Button size="sm" variant="ghost" onClick={() => save({ permissions: { ...settings.permissions, feedback_pin: '' } })}>Remover PIN</Button>}
      </div>
    </form>
  );
}

function WorkdaySection() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const [w, setW] = React.useState({ start: settings.workday_start, end: settings.workday_end, break_start: settings.break_start, break_end: settings.break_end });
  React.useEffect(() => { setW({ start: settings.workday_start, end: settings.workday_end, break_start: settings.break_start, break_end: settings.break_end }); }, [settings.workday_start, settings.workday_end, settings.break_start, settings.break_end]);
  const error = validateWorkday(w);
  const eff = error ? null : effectiveMinutes(w);
  const dirty = w.start !== settings.workday_start || w.end !== settings.workday_end || w.break_start !== settings.break_start || w.break_end !== settings.break_end;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (error) return;
    try { await save({ workday_start: w.start, workday_end: w.end, break_start: w.break_start, break_end: w.break_end, daily_minutes: eff!, weekly_minutes: eff! * 5 }); toast('Jornada salva.'); }
    catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Section title="Jornada" description="Segunda a sexta. Sem expediente aos sábados e domingos.">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Início" type="time" required value={w.start} onChange={(e) => setW({ ...w, start: e.target.value })} />
          <TextField label="Fim" type="time" required value={w.end} onChange={(e) => setW({ ...w, end: e.target.value })} />
          <TextField label="Início do intervalo" type="time" required value={w.break_start} onChange={(e) => setW({ ...w, break_start: e.target.value })} />
          <TextField label="Fim do intervalo" type="time" required value={w.break_end} onChange={(e) => setW({ ...w, break_end: e.target.value })} />
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : (
          <p className="text-sm">Carga efetiva: <strong className="text-gold">{fmtDuration(eff!)}</strong> por dia ({eff} min) · <strong className="text-gold">{fmtDuration(eff! * 5)}</strong> por semana{eff !== 528 && <span className="text-orange"> — difere do padrão 8h48</span>}</p>
        )}
        <p className="text-xs text-muted">O bloco de intervalo do modelo de rotina não muda sozinho: ajuste-o em “Modelo de rotina” se mudar o intervalo.</p>
        <Button type="submit" size="sm" disabled={!!error || !dirty}>Salvar jornada</Button>
      </form>
    </Section>
  );
}

const OPTIONAL_COLLECTIONS: string[] = ['notion_sync_state', 'person_metrics'];

export default function Configuracoes() {
  const { settings, save } = useSettings();
  const { email, mode } = useAuth();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [cat, setCat] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function exportBackup() {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), version: 1 };
    for (const c of COLLECTIONS) {
      // Tabelas de migrations opcionais (0002: notion_sync_state; 0007: person_metrics): sem elas, o backup segue sem a coleção.
      try { out[c] = await repo(c).list({ all: true }); } catch (e) { if (!OPTIONAL_COLLECTIONS.includes(c)) throw e; }
    }
    download(`central-comando-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), 'application/json');
  }
  async function importBackup(file: File) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo grande demais (máx. 20 MB).');
      let data: any;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('O arquivo não é um JSON válido.'); }
      if (!data || typeof data !== 'object' || data.version !== 1) throw new Error('Arquivo de backup inválido (versão não reconhecida).');
      if (!(await confirm({ title: 'Importar backup', message: 'Os registros do arquivo serão ADICIONADOS aos atuais (registros com o mesmo ID são ignorados). Continuar?', confirmLabel: 'Importar' }))) return;
      let n = 0, skipped = 0;
      const isRecord = (x: unknown): x is Record<string, unknown> & { id: string } =>
        !!x && typeof x === 'object' && !Array.isArray(x) && typeof (x as any).id === 'string' && (x as any).id.length > 0 && (x as any).id.length <= 64;
      for (const c of COLLECTIONS) {
        if (c === 'settings' || !Array.isArray(data[c])) continue;
        let existing: { id: string; external_ref?: string | null }[];
        try { existing = await repo(c).list({ all: true }); } catch (e) { if (OPTIONAL_COLLECTIONS.includes(c)) continue; throw e; }
        const ids = new Set(existing.map((x) => x.id));
        // external_ref é único por usuário (migration 0002): item do Notion já presente não é duplicado.
        const refs = new Set(existing.map((x) => x.external_ref).filter(Boolean));
        const batch: Record<string, unknown>[] = [];
        for (const item of data[c]) {
          if (!isRecord(item)) { skipped++; continue; }
          if (ids.has(item.id)) continue;
          if (typeof item.external_ref === 'string' && refs.has(item.external_ref)) continue;
          const { created_at: _a, updated_at: _b, user_id: _u, ...rest } = item;
          batch.push(rest);
        }
        // Em lote (até 200 por requisição) — antes era uma requisição por registro.
        await repo(c).createMany(batch as any); n += batch.length;
      }
      resetStore(); toast(`${n} registro(s) importado(s)${skipped ? `, ${skipped} inválido(s) ignorado(s)` : ''}.`);
    } catch (e) { toast((e as Error).message, 'erro'); }
  }

  return (
    <div>
      <PageHeader title="Configurações" eyebrow="Sistema" />
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <LogoSection />
        <Section title="Perfil e aparência">
          <TextField label="Como devo chamar você?" defaultValue={settings.display_name} onBlur={(e) => e.target.value.trim() && save({ display_name: e.target.value.trim() })} />
          <div><span className="label">Tema</span>
            <Segmented label="Tema" value={settings.theme} onChange={(v) => save({ theme: v })} options={[{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'system', label: 'Sistema' }]} /></div>
        </Section>

        <WorkdaySection />

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
          <PinField />
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
