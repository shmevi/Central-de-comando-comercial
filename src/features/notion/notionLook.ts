/**
 * Aparência "igual ao Notion" das opções (cores das bases verificadas no schema), nas cores da Central.
 * Só exibição: nenhuma regra de negócio depende daqui.
 */
import type { TaskStatus } from '@/domain/types';
import { KR_STATUS } from '@/integrations/notion/config';

export type Tone = 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'purple';
export const TONE_RGB: Record<Tone, string> = {
  gray: 'rgb(var(--muted))', blue: 'rgb(var(--info))', yellow: 'rgb(var(--warning))',
  green: 'rgb(var(--success))', red: 'rgb(var(--danger))', purple: 'rgb(var(--purple))',
};
/** Classes de um "chip" no tom pedido (borda + texto). */
export const toneChip = (t: Tone) => ({
  gray: 'border-border text-muted', blue: 'border-info/50 text-info', yellow: 'border-warning/50 text-warning',
  green: 'border-success/50 text-success', red: 'border-danger/50 text-danger', purple: 'border-purple/50 text-purple',
}[t]);

/** STATUS das Tarefas: nomes e cores do Notion. */
export const TASK_STATUS_NOTION: Record<TaskStatus, { label: string; tone: Tone }> = {
  a_fazer: { label: 'Não iniciada', tone: 'gray' },
  em_andamento: { label: 'Em andamento', tone: 'blue' },
  aguardando: { label: 'Pausada', tone: 'yellow' },
  concluida: { label: 'Concluída', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'red' },
};
/** ATRIBUIÇÃO: cores do Notion. */
export const ATTRIBUTION_TONE: Record<string, Tone> = { '70%': 'green', '20%': 'blue', '10%': 'red', 'OFF WORK (INDIVIDUAL)': 'purple' };
export const attributionTone = (n: string): Tone => ATTRIBUTION_TONE[n] ?? 'gray';
/** Status dos KRs: "A caminho"/"??" azul, "Concluído" verde, "Não Atingiu" vermelho. */
export function krStatusTone(s: string | null | undefined): Tone {
  if (!s || s === KR_STATUS.a_caminho || s === KR_STATUS.em_analise) return 'blue';
  if (/^conclu/i.test(s)) return 'green';
  if (/^n[ãa]o atingiu/i.test(s)) return 'red';
  return 'gray';
}
