import type { BlockStatus, Priority, Recurrence, TaskStatus } from './types';

export const PRIORITY: Record<Priority, { label: string; cls: string; rank: number }> = {
  urgente: { label: 'Urgente', cls: 'border-danger/60 text-danger bg-danger/10', rank: 0 },
  alta: { label: 'Alta', cls: 'border-orange/60 text-orange bg-orange/10', rank: 1 },
  media: { label: 'Média', cls: 'border-gold-300/60 text-gold bg-gold-300/10', rank: 2 },
  baixa: { label: 'Baixa', cls: 'border-border text-muted', rank: 3 },
};
export const TASK_STATUS: Record<TaskStatus, string> = {
  a_fazer: 'A fazer', em_andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada',
};
export const RECURRENCE: Record<Recurrence, string> = { nenhuma: 'Não se repete', diaria: 'Diária (dias úteis)', semanal: 'Semanal', mensal: 'Mensal' };
export const BLOCK_STATUS: Record<BlockStatus, { label: string; cls: string }> = {
  planejado: { label: 'Planejado', cls: 'border-border text-muted' },
  em_andamento: { label: 'Em andamento', cls: 'border-gold-300/60 text-gold bg-gold-300/10' },
  concluido: { label: 'Concluído', cls: 'border-success/60 text-success bg-success/10' },
  adiado: { label: 'Adiado', cls: 'border-orange/60 text-orange bg-orange/10' },
};
export const TRACKS = [
  { value: 'atendimento', label: 'Atendimento' }, { value: 'objecoes', label: 'Objeções' }, { value: 'negociacao', label: 'Negociação' },
  { value: 'crm', label: 'CRM' }, { value: 'fechamento', label: 'Fechamento' }, { value: 'outro', label: 'Outro' },
];
export const toOptions = (r: Record<string, string>) => Object.entries(r).map(([value, label]) => ({ value, label }));
