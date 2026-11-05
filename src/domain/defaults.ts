import type { RoutineTemplateBlock, Settings, Task } from './types';
import { uid } from '@/lib/utils';

export const BASE_ROUTINE: Omit<RoutineTemplateBlock, 'id'>[] = [
  { start: '12:12', end: '13:00', title: 'Análise de dados', category: 'Dados' },
  { start: '13:00', end: '14:00', title: 'Acompanhamento e feedback', category: 'Equipe' },
  { start: '14:00', end: '16:00', title: 'Prioridade do dia', category: 'Prioridade' },
  { start: '16:00', end: '17:00', title: 'Sistemas e processos', category: 'Sistemas' },
  { start: '17:00', end: '18:00', title: 'Reuniões', category: 'Reuniões' },
  { start: '18:00', end: '19:00', title: 'Intervalo', category: 'Intervalo', is_break: true },
  { start: '19:00', end: '20:30', title: 'Projetos e melhorias', category: 'Projetos' },
  { start: '20:30', end: '21:30', title: 'Acompanhamento de resultados', category: 'Resultados' },
  { start: '21:30', end: '22:00', title: 'Relatórios e planejamento', category: 'Planejamento' },
];
export const baseRoutineBlocks = (): RoutineTemplateBlock[] => BASE_ROUTINE.map((b) => ({ ...b, id: uid() }));

export const WEEKLY_FOCUS: Record<string, string> = {
  '1': 'Dados e metas', '2': 'Feedbacks', '3': 'Recrutamento', '4': 'Sistemas', '5': 'Reuniões',
};

export const DEFAULT_CATEGORIES = ['Dados', 'Equipe', 'Prioridade', 'Sistemas', 'Reuniões', 'Projetos', 'Resultados', 'Planejamento', 'Recrutamento', 'Treinamento', 'Geral'];

export const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'created_at' | 'updated_at'> = {
  theme: 'dark',
  workday_start: '12:12', workday_end: '22:00', break_start: '18:00', break_end: '19:00',
  daily_minutes: 528, weekly_minutes: 2640,
  categories: DEFAULT_CATEGORIES,
  weekly_focus: WEEKLY_FOCUS,
  notion_enabled: false, notion_write_enabled: false,
  notion_mapping: {
    tarefas: { title: 'Nome', status: 'Status', due_date: 'Prazo', institution: 'Instituição', priority: 'Prioridade' },
    okrs: { title: 'Objetivo', cycle: 'Ciclo', institution: 'Instituição', owner: 'Responsável' },
    reunioes: { title: 'Título', date: 'Data', institution: 'Instituição', decisions: 'Decisões' },
  },
  display_name: 'Coordenador',
  permissions: { feedbacks_restricted: true, feedback_pin: '' },
};

export const INSTITUTIONS = [
  { code: 'CPPEM', name: 'CPPEM', color: '#D4AF5A', active: true },
  { code: 'UNICIVE', name: 'UNICIVE', color: '#E9852B', active: true },
  { code: 'COLEGIO_CPPEM', name: 'Colégio CPPEM', color: '#78AAF0', active: true },
];

type TaskSeed = Pick<Task, 'title' | 'description' | 'due_date' | 'category' | 'priority'>;
/** Dados iniciais (editáveis, não recorrentes). Sem nomes de candidatos nem horários inventados. */
export const INITIAL_TASKS: TaskSeed[] = [
  { title: 'Selecionar candidatos de vendas e agendar entrevistas', description: 'Triagem dos currículos recebidos e agendamento das entrevistas. Horários a definir com os candidatos.', due_date: '2026-11-04', category: 'Recrutamento', priority: 'alta' },
  { title: 'Confirmar entrevistas e preparar avaliação', description: 'Confirmar presença dos candidatos selecionados e preparar o roteiro de avaliação.', due_date: '2026-11-05', category: 'Recrutamento', priority: 'alta' },
  { title: 'Realizar entrevistas e registrar decisões', description: 'Conduzir as entrevistas e registrar a decisão de cada candidato no pipeline.', due_date: '2026-11-06', category: 'Recrutamento', priority: 'alta' },
];
