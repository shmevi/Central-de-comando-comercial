import { describe, expect, it } from 'vitest';
import { pruneOff } from './offDays';
import { retimeBreak } from './templateBreak';

describe('dias sem rotina (apagados de propósito)', () => {
  it('guarda só os últimos 60 dias, sem repetir e em ordem', () => {
    expect(pruneOff(['2026-11-12', '2026-11-10', '2026-11-12', '2026-08-01', 'lixo'], '2026-11-12')).toEqual(['2026-11-10', '2026-11-12']);
  });
});

describe('intervalo da Jornada → modelo de rotina', () => {
  const tpl = { id: 't', blocks: [
    { id: 'a', start: '17:00', end: '18:00', title: 'Reuniões', category: 'R' },
    { id: 'i', start: '18:00', end: '19:00', title: 'Intervalo', category: 'Intervalo', is_break: true },
    { id: 'b', start: '19:00', end: '20:30', title: 'Projetos', category: 'P' },
  ] };
  it('move o bloco de intervalo e não mexe nos outros', () => {
    const { updates, clashes } = retimeBreak([tpl], '18:00', '19:00');
    expect(updates).toEqual([]); expect(clashes).toEqual([]); // nada mudou
    const r = retimeBreak([tpl], '18:30', '19:30');
    expect(r.updates[0].blocks.find((b) => b.is_break)).toMatchObject({ start: '18:30', end: '19:30' });
    expect(r.updates[0].blocks.find((b) => b.id === 'b')).toMatchObject({ start: '19:00', end: '20:30' });
    expect(r.clashes).toEqual(['Projetos (19:00–20:30)']); // avisa, sem alterar
  });
});
