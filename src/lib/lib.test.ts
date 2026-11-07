import { describe, it, expect } from 'vitest';
import { effectiveMinutes, workdayStatus, workedMinutes, hitsBreak } from './workday';
import { fmtDate, parseBRDate, startOfWeek, addDays, fmtDuration } from './time';
import { findConflicts } from './conflicts';
import { krProgress, objectiveProgress } from './okr';
import { buildWhatsAppInvite } from './whatsapp';

describe('jornada', () => {
  it('carga efetiva = 528 min (8h48)', () => {
    expect(effectiveMinutes()).toBe(528);
    expect(fmtDuration(528)).toBe('8h48');
    expect(effectiveMinutes() * 5).toBe(44 * 60);
  });
  it('status do expediente', () => {
    expect(workdayStatus('2026-11-05', '11:00')).toBe('antes');
    expect(workdayStatus('2026-11-05', '15:00')).toBe('em_expediente');
    expect(workdayStatus('2026-11-05', '18:30')).toBe('intervalo');
    expect(workdayStatus('2026-11-05', '22:00')).toBe('encerrado');
    expect(workdayStatus('2026-11-07', '15:00')).toBe('sem_expediente');
  });
  it('minutos trabalhados descontam intervalo', () => {
    expect(workedMinutes('2026-11-05', '13:12')).toBe(60);
    expect(workedMinutes('2026-11-05', '18:30')).toBe(348);
    expect(workedMinutes('2026-11-05', '23:00')).toBe(528);
  });
  it('detecta bloco no intervalo', () => {
    expect(hitsBreak('17:30', '18:30')).toBe(true);
    expect(hitsBreak('19:00', '20:00')).toBe(false);
  });
});

describe('datas', () => {
  it('formata e valida dd/mm/aaaa', () => {
    expect(fmtDate('2026-11-04')).toBe('04/11/2026');
    expect(parseBRDate('31/02/2026')).toBeNull();
    expect(parseBRDate('06/11/2026')).toBe('2026-11-06');
  });
  it('semana começa na segunda', () => {
    expect(startOfWeek('2026-11-05')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('conflitos', () => {
  it('encontra sobreposição no mesmo dia', () => {
    const a = { id: 'a', date: '2026-11-06', start: '14:00', end: '15:00' };
    const others = [
      { id: 'b', date: '2026-11-06', start: '14:30', end: '15:30' },
      { id: 'c', date: '2026-11-06', start: '15:00', end: '16:00' },
      { id: 'd', date: '2026-11-07', start: '14:00', end: '15:00' },
    ];
    expect(findConflicts(a, others).map((x) => x.id)).toEqual(['b']);
  });
});

describe('OKR', () => {
  it('sem meta válida não há progresso', () => {
    expect(krProgress({ id: '1', title: '', start: 0, target: null, current: 5, unit: '' })).toBeNull();
    expect(krProgress({ id: '1', title: '', start: 10, target: 10, current: 5, unit: '' })).toBeNull();
    expect(krProgress({ id: '1', title: '', start: 0, target: 200, current: 50, unit: '' })).toBe(25);
    expect(objectiveProgress([])).toBeNull();
  });
});

describe('WhatsApp', () => {
  it('não inventa horário quando não confirmado', () => {
    const msg = buildWhatsAppInvite({ name: 'Fulano', position: 'Consultor', institution: 'CPPEM', date: '2026-11-06', start: '14:00', confirmed: false, location: '' });
    expect(msg).toContain('a confirmar');
    expect(msg).not.toContain('14:00');
  });
});

import { validateWorkday } from './workday';
import { safeHttpUrl } from './utils';
import { checkPin, hashPin } from './pin';
import { isoDay } from '@/integrations/notion/mapping';

describe('validações da revisão', () => {
  it('jornada fora de ordem é recusada', () => {
    expect(validateWorkday({ start: '12:12', end: '22:00', break_start: '18:00', break_end: '19:00' })).toBeNull();
    expect(validateWorkday({ start: '12:12', end: '22:00', break_start: '19:00', break_end: '18:00' })).toMatch(/ordem/);
    expect(validateWorkday({ start: '', end: '22:00', break_start: '18:00', break_end: '19:00' })).toMatch(/Preencha/);
  });
  it('links só http(s)', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('https://exemplo.com/a')).toBe('https://exemplo.com/a');
  });
  it('PIN guardado como hash', async () => {
    const h = await hashPin('1234');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(h).not.toContain('1234');
    expect(await checkPin('1234', h)).toBe(true);
    expect(await checkPin('0000', h)).toBe(false);
  });
  it('Notion: datas inválidas viram null (nunca uma data inventada)', () => {
    expect(isoDay('2026-11-06T10:00:00.000Z')).toBe('2026-11-06');
    expect(isoDay('06/11/2026')).toBeNull();
    expect(isoDay('2026-02-30')).toBeNull();
    expect(isoDay(null)).toBeNull();
  });
});
