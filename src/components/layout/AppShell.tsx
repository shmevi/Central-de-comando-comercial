import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, HardDrive, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { NAV, NAV_GROUPS, MOBILE_TABS, type NavGroup } from '@/app/nav';
import { BrandLogo, useAppIcon } from './BrandLogo';
import { prefetchIdle, prefetchRoute } from '@/app/routes';

/** Pré-carrega código e dados da tela quando a pessoa aponta para o link (antes do clique). */
const intent = (to: string) => ({ onMouseEnter: () => prefetchRoute(to), onFocus: () => prefetchRoute(to), onTouchStart: () => prefetchRoute(to) });
import { cn } from '@/lib/utils';
import { useScope } from '@/app/scope';
import { useInstitutions, useSettings } from '@/app/hooks';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Loading } from '@/components/ui/misc';

function Brand() {
  return (
    <div className="flex items-center gap-3 px-1">
      <BrandLogo size={38} />
      <div className="min-w-0 leading-none">
        <div className="font-brand text-[14px] uppercase leading-tight tracking-[.01em] text-fg">Central de Comando</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[.32em] text-gold">Comercial</div>
      </div>
    </div>
  );
}

const GROUPS_KEY = 'ccc:nav-closed';
/** Grupos recolhidos, lembrados neste navegador. O grupo da página atual sempre abre. */
function useCollapsedGroups(activeGroup: NavGroup | undefined) {
  const [closed, setClosed] = React.useState<NavGroup[]>(() => {
    try { return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]'); } catch { return []; }
  });
  React.useEffect(() => { if (activeGroup && closed.includes(activeGroup)) setClosed((c) => c.filter((g) => g !== activeGroup)); }, [activeGroup]); // eslint-disable-line
  React.useEffect(() => { try { localStorage.setItem(GROUPS_KEY, JSON.stringify(closed)); } catch { /* ignore */ } }, [closed]);
  const toggle = (g: NavGroup) => setClosed((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]));
  return { isOpen: (g: NavGroup) => !closed.includes(g), toggle };
}

function NavList({ onNavigate, idPrefix }: { onNavigate?: () => void; idPrefix: string }) {
  const loc = useLocation();
  const activeGroup = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))?.group;
  const { isOpen, toggle } = useCollapsedGroups(activeGroup);
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      {NAV_GROUPS.map((g) => {
        const open = isOpen(g);
        const listId = `${idPrefix}-grupo-${g.replace(/\W+/g, '-').toLowerCase()}`;
        const Chevron = open ? ChevronDown : ChevronRight;
        return (
          <div key={g}>
            <button type="button" onClick={() => toggle(g)} aria-expanded={open} aria-controls={listId}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[.2em] text-muted/80 transition hover:bg-surface-2 hover:text-fg">
              {g}
              <Chevron size={14} aria-hidden className="transition-transform duration-200" />
            </button>
            {/* grid-rows 0fr↔1fr: anima a altura sem medir o conteúdo; inert/hidden tira os links fechados do Tab */}
            <div id={listId} className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
              aria-hidden={!open} {...(!open ? { inert: '' } : {})}>
              <ul className="flex min-h-0 flex-col gap-0.5 overflow-hidden pb-2">
                {NAV.filter((n) => n.group === g).map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === '/'} onClick={onNavigate} {...intent(to)}
                      className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                        isActive ? 'bg-surface-3 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                      {({ isActive }) => (<>
                        <span aria-hidden className={cn('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-300 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
                        <Icon size={17} aria-hidden className={isActive ? 'text-gold' : ''} />{label}
                      </>)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function ScopeSelect() {
  const { scope, setScope } = useScope();
  const { active } = useInstitutions();
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="sr-only font-medium text-muted sm:not-sr-only">Instituição</span>
      <select value={scope} onChange={(e) => setScope(e.target.value)} className="field h-9 w-auto max-w-[9.5rem] py-1 pr-8 sm:max-w-none" aria-label="Filtrar por instituição">
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
  useAppIcon(); // logo personalizada também na aba e no atalho da tela inicial
  React.useEffect(() => { prefetchIdle(); }, []); // código das telas leves, com o navegador ocioso
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
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#conteudo" className="card sr-only px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]">Pular para o conteúdo</a>
      <aside className="scrollbar-thin sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border/60 bg-surface/70 px-3 py-5 lg:flex">
        <Brand />
        <NavList idPrefix="lateral" />
        <div className="mt-auto space-y-2 px-1 text-xs text-muted">
          <div className="panel p-3">
            <div className="flex items-center gap-2"><span className={cn('h-1.5 w-1.5 rounded-full', mode === 'supabase' ? 'bg-success' : 'bg-orange')} aria-hidden />
              {mode === 'supabase' ? 'Supabase' : 'Local (navegador)'}</div>
            {email && <div className="mt-1 truncate text-fg/80">{email}</div>}
          </div>
          {mode === 'supabase' && <Button variant="ghost" size="sm" onClick={signOut} className="w-full"><LogOut size={14} />Sair</Button>}
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="scrollbar-thin absolute inset-y-0 left-0 flex w-[86vw] max-w-xs animate-slide-up flex-col gap-6 overflow-y-auto border-r border-border/60 bg-surface px-3 py-5">
            <div className="flex items-center justify-between"><Brand /><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={18} /></Button></div>
            <NavList idPrefix="gaveta" onNavigate={() => setOpen(false)} />
            {mode === 'supabase' && <Button variant="ghost" size="sm" onClick={signOut}><LogOut size={14} />Sair</Button>}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/60 bg-bg/80 px-4 py-2.5 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu size={20} /></Button>
            <BrandLogo size={28} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="hidden lg:inline">Fuso: America/Recife</span>
            {mode === 'local' && (
              <span className="chip border-orange/40 text-orange" title="Modo local: os dados ficam salvos apenas neste navegador. Exporte backups em Configurações.">
                <HardDrive size={12} aria-hidden /><span className="hidden sm:inline">Dados só neste navegador</span><span className="sr-only sm:hidden">Dados só neste navegador</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1"><ScopeSelect /><ThemeToggle /></div>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <ErrorBoundary resetKey={loc.pathname}>
            <React.Suspense fallback={<Loading />}><Outlet /></React.Suspense>
          </ErrorBoundary>
        </main>
        <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/60 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          {NAV.filter((n) => MOBILE_TABS.includes(n.to)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} {...intent(to)} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-gold' : 'text-muted')}>
              <Icon size={20} aria-hidden />{label.split(' ')[0]}
            </NavLink>
          ))}
          <button type="button" onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted"><Menu size={20} aria-hidden />Mais</button>
        </nav>
      </div>
    </div>
  );
}
