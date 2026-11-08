/**
 * Carregadores das telas (cada uma vira um arquivo JS separado) + pré-carregamento.
 * - Ao APONTAR para um item do menu (mouse, foco do teclado ou toque): baixa o código da tela e os dados dela.
 * - Com o app ocioso, depois da tela inicial: baixa o código das telas leves, para a 1ª visita abrir na hora.
 *   As telas com gráficos (Relatórios, números da pessoa: ~390 KB de Recharts) só são pré-carregadas pela intenção.
 */
import { prefetch } from '@/data/store';
import { ROUTE_DATA } from '@/data/prefetch';

export const PAGE_LOADERS = {
  '/rotina': () => import('@/pages/Rotina'),
  '/agenda': () => import('@/pages/Agenda'),
  '/tarefas': () => import('@/pages/Tarefas'),
  '/equipes': () => import('@/pages/Equipes'),
  '/equipes/:personId': () => import('@/pages/EquipePessoa'),
  '/treinamentos': () => import('@/pages/Treinamentos'),
  '/reunioes': () => import('@/pages/Reunioes'),
  '/okrs': () => import('@/pages/Okrs'),
  '/projetos': () => import('@/pages/Projetos'),
  '/relatorios': () => import('@/pages/Relatorios'),
  '/integracoes': () => import('@/pages/Integracoes'),
  '/configuracoes': () => import('@/pages/Configuracoes'),
} as const;
type Path = keyof typeof PAGE_LOADERS;
const HEAVY = new Set<Path>(['/relatorios', '/equipes/:personId']);

const asked = new Set<string>();
/** Pré-carrega código e dados de uma rota do menu. Idempotente e silencioso (falha não atrapalha a navegação). */
export function prefetchRoute(to: string) {
  if (asked.has(to)) { void prefetch(ROUTE_DATA[to] ?? []); return; } // dados podem ter sido limpos (ex.: saiu da conta)
  asked.add(to);
  const load = PAGE_LOADERS[to as Path];
  if (load) load().catch(() => asked.delete(to));
  void prefetch(ROUTE_DATA[to] ?? []);
}

/** Conexão econômica (modo de economia de dados ou 2G): não pré-carrega nada em segundo plano. */
function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ''));
}

/** Depois que a tela inicial terminou, baixa o código das telas leves quando o navegador estiver ocioso. */
export function prefetchIdle() {
  if (typeof window === 'undefined' || saveData()) return;
  const run = () => {
    for (const [path, load] of Object.entries(PAGE_LOADERS) as [Path, () => Promise<unknown>][]) {
      if (!HEAVY.has(path)) load().catch(() => { /* rede instável: a tela baixa ao abrir */ });
    }
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  setTimeout(() => (ric ? ric(run, { timeout: 4000 }) : run()), 1500);
}
