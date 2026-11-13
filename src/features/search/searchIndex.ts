/**
 * Busca global — lógica PURA (sem React): normaliza (sem acento, minúsculas), exige TODAS as palavras e ordena
 * (título que começa com a busca > título que contém > só nos outros campos). No máximo 5 por grupo.
 */
export type SearchGroup = 'Tarefas' | 'Pessoas' | 'Reuniões' | 'Agenda' | 'OKRs' | 'Projetos' | 'Treinamentos' | 'Anotações';
export const GROUP_ORDER: SearchGroup[] = ['Tarefas', 'Pessoas', 'Reuniões', 'Agenda', 'OKRs', 'Projetos', 'Treinamentos', 'Anotações'];

export interface SearchDoc { group: SearchGroup; id: string; title: string; subtitle?: string; extra?: string; to?: string }
export interface SearchHit extends SearchDoc { score: number }

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function search(docs: SearchDoc[], query: string, perGroup = 5): { group: SearchGroup; hits: SearchHit[] }[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length || words.join('').length < 2) return [];
  const q = words.join(' ');
  const hits: SearchHit[] = [];
  for (const d of docs) {
    const title = normalize(d.title);
    const all = `${title} ${normalize(d.subtitle ?? '')} ${normalize(d.extra ?? '')}`;
    if (!words.every((w) => all.includes(w))) continue;
    const score = title.startsWith(q) ? 3 : title.includes(q) ? 2 : words.every((w) => title.includes(w)) ? 1.5 : 1;
    hits.push({ ...d, score });
  }
  return GROUP_ORDER.map((group) => ({
    group,
    hits: hits.filter((h) => h.group === group).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'pt-BR')).slice(0, perGroup),
  })).filter((g) => g.hits.length);
}
