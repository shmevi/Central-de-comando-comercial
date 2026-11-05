import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { NAV, MOBILE_TABS } from '@/app/nav';
import { Monogram } from './Monogram';
import { cn } from '@/lib/utils';
import { useScope } from '@/app/scope';
import { useInstitutions, useSettings } from '@/app/hooks';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/button';

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Monogram size={38} />
      <div className="leading-none">
        <div className="font-display text-lg font-extrabold uppercase tracking-wider text-gold">Central de Comando</div>
        <div className="font-display text-xs font-bold uppercase tracking-[.3em] text-muted">Comercial</div>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g}>
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[.2em] text-muted/80">{g}</div>
          <ul className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === g).map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'} onClick={onNavigate}
                  className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition', isActive ? 'bg-gold-300/15 text-gold font-semibold' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                  <Icon size={18} aria-hidden />{label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ScopeSelect() {
  const { scope, setScope } = useScope();
  const { active } = useInstitutions();
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="sr-only sm:not-sr-only text-muted uppercase tracking-wider font-semibold">Instituição</span>
      <select value={scope} onChange={(e) => setScope(e.target.value)} className="field h-9 w-auto py-1 pr-8" aria-label="Filtrar por instituição">
        <option value="all">Todas</option>
        {active.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        <option value="none">Sem instituição</option>
      </select>
    </label>
  );
}

function ThemeToggle() {
  const { settings, save } = useSettings();
  const dark = settings.theme !== 'light';
  return (
    <Button variant="ghost" size="icon" aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'} onClick={() => save({ theme: dark ? 'light' : 'dark' })}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}

export function AppShell() {
  const [open, setOpen] = React.useState(false);
  const loc = useLocation();
  const { mode, email, signOut } = useAuth();
  const { settings } = useSettings();

  React.useEffect(() => {
    const t = settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme;
    document.documentElement.dataset.theme = t;
  }, [settings.theme]);
  React.useEffect(() => { setOpen(false); }, [loc.pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] card px-3 py-2">Pular para o conteúdo</a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-4 lg:flex">
        <Brand />
        <NavList />
        <div className="mt-auto space-y-2 text-xs text-muted">
          <div className="rounded-lg border border-border p-2">
            Persistência: <strong className="text-fg">{mode === 'supabase' ? 'Supabase' : 'Local (navegador)'}</strong>
            {email && <div className="truncate">{email}</div>}
          </div>
          {mode === 'supabase' && <Button variant="ghost" size="sm" onClick={signOut} className="w-full"><LogOut size={14} />Sair</Button>}
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col gap-6 overflow-y-auto bg-surface p-4">
            <div className="flex items-center justify-between"><Brand /><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={18} /></Button></div>
            <NavList onNavigate={() => setOpen(false)} />
            {mode === 'supabase' && <Button variant="ghost" size="sm" onClick={signOut}><LogOut size={14} />Sair</Button>}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu size={20} /></Button>
            <Monogram size={30} />
          </div>
          <div className="hidden text-xs text-muted lg:block">Fuso: America/Recife</div>
          <div className="flex items-center gap-1"><ScopeSelect /><ThemeToggle /></div>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
        <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
          {NAV.filter((n) => MOBILE_TABS.includes(n.to)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-wide', isActive ? 'text-gold' : 'text-muted')}>
              <Icon size={20} aria-hidden />{label.split(' ')[0]}
            </NavLink>
          ))}
          <button type="button" onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted"><Menu size={20} aria-hidden />Mais</button>
        </nav>
      </div>
    </div>
  );
}
