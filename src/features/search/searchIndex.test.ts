import { describe, expect, it } from 'vitest';
import { normalize, search, type SearchDoc } from './searchIndex';

const docs: SearchDoc[] = [
  { group: 'Tarefas', id: 't1', title: 'Revisar metas de matrícula', extra: 'semana' },
  { group: 'Tarefas', id: 't2', title: 'Ligar para o supervisor', extra: 'confirmar metas' },
  { group: 'Pessoas', id: 'p1', title: 'Ana Lúcia', subtitle: 'Consultora' },
  { group: 'Reuniões', id: 'm1', title: 'Alinhamento de metas', subtitle: '12/11/2026' },
];

describe('busca global', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(normalize('Matrícula ÁGIL')).toBe('matricula agil');
    expect(search(docs, 'lucia')[0].hits[0].id).toBe('p1');
    expect(search(docs, 'MATRICULA')[0].hits[0].id).toBe('t1');
  });
  it('exige todas as palavras e agrupa na ordem fixa', () => {
    const r = search(docs, 'metas');
    expect(r.map((g) => g.group)).toEqual(['Tarefas', 'Reuniões']);
    expect(search(docs, 'metas semana')[0].hits.map((h) => h.id)).toEqual(['t1']);
  });
  it('título vem antes de quem só tem a palavra em outro campo', () => {
    expect(search(docs, 'metas')[0].hits.map((h) => h.id)).toEqual(['t1', 't2']);
  });
  it('busca curta demais não devolve nada', () => {
    expect(search(docs, 'a')).toEqual([]);
    expect(search(docs, '   ')).toEqual([]);
  });
});
