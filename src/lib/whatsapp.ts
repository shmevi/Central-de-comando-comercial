import { fmtDate } from './time';
export interface InviteInput { name: string; position: string; institution: string; date: string | null; start: string | null; confirmed: boolean; location: string }
/** Monta texto de convite para COPIAR. Nada é enviado automaticamente. */
export function buildWhatsAppInvite(i: InviteInput): string {
  const when = i.confirmed && i.date && i.start ? `${fmtDate(i.date)}, às ${i.start}` : 'data e horário a confirmar';
  return [
    `Olá, ${i.name || '[nome do candidato]'}! Tudo bem?`,
    ``,
    `Aqui é da coordenação comercial ${i.institution ? `do(a) ${i.institution}` : ''}. Gostaríamos de convidar você para uma entrevista para a vaga de ${i.position || '[vaga]'}.`,
    ``,
    `📅 Quando: ${when}`,
    `📍 Local: ${i.location || 'a confirmar'}`,
    ``,
    `Pode confirmar sua presença respondendo esta mensagem?`,
    ``,
    `Seus dados serão usados apenas para este processo seletivo, conforme a LGPD.`,
  ].join('\n');
}
