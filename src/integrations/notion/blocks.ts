/**
 * Conteúdo de uma página do Notion (blocos) → texto simples para exibir na Central. Puro e testável.
 * Só leitura: a Central nunca escreve blocos no Notion. Tipos sem texto (imagem, arquivo, base interna) viram
 * uma indicação curta, para a pessoa saber que existe algo lá — o conteúdo completo continua no Notion.
 */
type Json = any; // blocos crus da API do Notion

export const MAX_BODY_CHARS = 20000;
export const MAX_BODY_BLOCKS = 300;

const rich = (arr: Json): string => (Array.isArray(arr) ? arr.map((t) => t?.plain_text ?? '').join('') : '');

/** Uma linha de texto para o bloco (sem o recuo), ou null quando o bloco não tem nada a mostrar. */
export function blockLine(b: Json, numberInList = 1): string | null {
  const t = b?.type as string | undefined;
  const v = t ? b[t] : undefined;
  switch (t) {
    case 'paragraph': return rich(v?.rich_text);
    case 'heading_1': return `# ${rich(v?.rich_text)}`;
    case 'heading_2': return `## ${rich(v?.rich_text)}`;
    case 'heading_3': return `### ${rich(v?.rich_text)}`;
    case 'bulleted_list_item': return `• ${rich(v?.rich_text)}`;
    case 'numbered_list_item': return `${numberInList}. ${rich(v?.rich_text)}`;
    case 'to_do': return `${v?.checked ? '[x]' : '[ ]'} ${rich(v?.rich_text)}`;
    case 'toggle': return `▸ ${rich(v?.rich_text)}`;
    case 'quote': return `> ${rich(v?.rich_text)}`;
    case 'callout': return `${v?.icon?.emoji ? `${v.icon.emoji} ` : ''}${rich(v?.rich_text)}`;
    case 'code': return `\`\`\`\n${rich(v?.rich_text)}\n\`\`\``;
    case 'equation': return v?.expression ?? '';
    case 'divider': return '---';
    case 'table_row': return (v?.cells ?? []).map((c: Json) => rich(c)).join(' | ');
    case 'bookmark': case 'embed': case 'link_preview': return v?.url ? `[link] ${v.url}` : null;
    case 'image': case 'video': case 'file': case 'pdf': case 'audio': {
      const cap = rich(v?.caption);
      const kind = { image: 'imagem', video: 'vídeo', file: 'arquivo', pdf: 'PDF', audio: 'áudio' }[t];
      return `[${kind}${cap ? `: ${cap}` : ''} — abra no Notion]`;
    }
    case 'child_page': return `[página: ${v?.title ?? 'sem título'} — abra no Notion]`;
    case 'child_database': return `[base do Notion${v?.title ? `: ${v.title}` : ''} — abra no Notion]`;
    case 'link_to_page': return '[link para outra página — abra no Notion]';
    default: return null; // column_list, column, synced_block, table…: só os filhos interessam
  }
}

/** Blocos que não devem ter os filhos lidos (conteúdo de outra página/base). */
export const SKIP_CHILDREN = new Set(['child_page', 'child_database', 'link_to_page']);

/** Junta as linhas, tira excesso de linhas vazias e limita o tamanho. */
export function finishBody(lines: string[], truncated = false): string {
  let s = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > MAX_BODY_CHARS) { s = s.slice(0, MAX_BODY_CHARS).trimEnd(); truncated = true; }
  return truncated ? `${s}\n… (continua no Notion)` : s;
}

/**
 * Lê o conteúdo de uma página usando uma função que lista os filhos de um bloco (com paginação).
 * Recuo de 2 espaços por nível; até 2 níveis abaixo da página e no máximo MAX_BODY_BLOCKS blocos.
 */
export async function readBody(listChildren: (blockId: string, cursor: string | null) => Promise<{ results: Json[]; has_more?: boolean; next_cursor?: string | null }>, pageId: string): Promise<string> {
  const lines: string[] = [];
  let count = 0; let truncated = false;
  async function walk(blockId: string, depth: number) {
    let cursor: string | null = null; let n = 0;
    for (let page = 0; page < 5; page++) {
      const r = await listChildren(blockId, cursor);
      for (const b of r.results ?? []) {
        if (count++ >= MAX_BODY_BLOCKS) { truncated = true; return; }
        n = b?.type === 'numbered_list_item' ? n + 1 : 0;
        const line = blockLine(b, n || 1);
        if (line != null) lines.push(`${'  '.repeat(depth)}${line}`);
        if (b?.has_children && depth < 2 && !SKIP_CHILDREN.has(b.type)) await walk(b.id, depth + 1);
        if (truncated) return;
      }
      if (!r.has_more || !r.next_cursor) return;
      cursor = r.next_cursor;
    }
  }
  await walk(pageId, 0);
  return finishBody(lines, truncated);
}
