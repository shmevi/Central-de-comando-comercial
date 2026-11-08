import { CalendarDays, CheckSquare, ClipboardList, Cog, FileBarChart, FolderKanban, GraduationCap, Home, Plug, Target, Timer, Users } from 'lucide-react';

export const NAV_GROUPS = ['Dia a dia', 'Gestão', 'Estratégia', 'Sistema'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export const NAV: { to: string; label: string; icon: typeof Home; group: NavGroup }[] = [
  { to: '/', label: 'Hoje', icon: Home, group: 'Dia a dia' },
  { to: '/rotina', label: 'Minha Rotina', icon: Timer, group: 'Dia a dia' },
  { to: '/agenda', label: 'Agenda Semanal', icon: CalendarDays, group: 'Dia a dia' },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, group: 'Dia a dia' },
  { to: '/equipes', label: 'Equipes e Feedbacks', icon: Users, group: 'Gestão' },
  { to: '/treinamentos', label: 'Treinamentos', icon: GraduationCap, group: 'Gestão' },
  { to: '/reunioes', label: 'Reuniões', icon: ClipboardList, group: 'Gestão' },
  { to: '/okrs', label: 'OKRs', icon: Target, group: 'Estratégia' },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban, group: 'Estratégia' },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, group: 'Estratégia' },
  { to: '/integracoes', label: 'Integrações', icon: Plug, group: 'Sistema' },
  { to: '/configuracoes', label: 'Configurações', icon: Cog, group: 'Sistema' },
];

export const MOBILE_TABS = ['/', '/rotina', '/tarefas', '/agenda'];
