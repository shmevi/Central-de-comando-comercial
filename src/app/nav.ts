import { CalendarDays, CheckSquare, ClipboardList, Cog, FileBarChart, FolderKanban, GraduationCap, Home, Plug, Target, Timer, UserSearch, Users, Wrench } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Hoje', icon: Home, group: 'MVP' },
  { to: '/rotina', label: 'Minha Rotina', icon: Timer, group: 'MVP' },
  { to: '/agenda', label: 'Agenda Semanal', icon: CalendarDays, group: 'MVP' },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, group: 'MVP' },
  { to: '/recrutamento', label: 'Recrutamento', icon: UserSearch, group: 'MVP' },
  { to: '/equipes', label: 'Equipes e Feedbacks', icon: Users, group: 'Gestão' },
  { to: '/treinamentos', label: 'Treinamentos', icon: GraduationCap, group: 'Gestão' },
  { to: '/reunioes', label: 'Reuniões', icon: ClipboardList, group: 'Gestão' },
  { to: '/sistemas', label: 'Sistemas e Melhorias', icon: Wrench, group: 'Estratégia' },
  { to: '/okrs', label: 'OKRs', icon: Target, group: 'Estratégia' },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban, group: 'Estratégia' },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, group: 'Estratégia' },
  { to: '/integracoes', label: 'Integrações', icon: Plug, group: 'Sistema' },
  { to: '/configuracoes', label: 'Configurações', icon: Cog, group: 'Sistema' },
] as const;

export const MOBILE_TABS = ['/', '/rotina', '/tarefas', '/recrutamento'];
