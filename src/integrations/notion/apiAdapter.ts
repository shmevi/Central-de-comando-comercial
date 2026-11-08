/**
 * Adaptador da API oficial do Notion — SÓ PARA O SERVIDOR (Edge Function notion-sync).
 * Nenhuma tela importa este arquivo, então ele não entra no JavaScript do navegador. O token é recebido por
 * parâmetro (vem de um Edge Secret) e nunca aparece em mensagem de erro ou log.
 *
 * Leitura: GET /data_sources/{id}, POST /data_sources/{id}/query, GET /pages/{id}, GET /pages/{id}/properties/{prop},
 * GET /blocks/{id}/children (conteúdo da página, só das páginas do responsável).
 * Escrita (só via `update`, chamado pelo envio Central → Notion já validado em pushCore.ts): PATCH /pages/{id} com
 * `properties`. Nunca cria, arquiva ou apaga páginas; nunca mexe em conteúdo (blocos).
 */
import type { NotionPage, NotionPropertyValue, NotionQuery, NotionSource, NotionStatusGroup, NotionWriteAdapter, NotionWriteValue } from './adapter';
import { PROPS, normalizePageId, normalizeUserId } from './config';
import { readBody } from './blocks';

export const NOTION_API = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2025-09-03';

type Json = any; // respostas da API — normalizadas logo abaixo
export interface ApiAdapterOptions {
  token: string;
  /** Data sources configurados (para o mapa de grupos de status). */
  dataSources: { tarefas: string; krs: string; objetivos: string };
  fetch?: typeof fetch;
  /** Espera entre tentativas após 429/5xx (ms). Injetável nos testes. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

/** UUID com hífens, formato que a API espera em filtros de pessoa. */
export const toUuid = (id: string) => { const h = normalizePageId(id); return /^[0-9a-f]{32}$/.test(h) ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : id; };

/** Nome do grupo de status na API ("To-do", "In progress", "Complete") → grupo interno. */
export function statusGroupOf(name: string | null | undefined): NotionStatusGroup | null {
  const n = (name ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (n === 'todo') return 'to_do';
  if (n === 'inprogress') return 'in_progress';
  if (n === 'complete' || n === 'completed' || n === 'done') return 'complete';
  return null;
}

/**
 * Progresso da fórmula em 0–100, só quando a escala pode ser CONFIRMADA pelos próprios Meta/Atual da página:
 * fração (0,4 = 40%) ou percentual (40). Texto "40%" também vale. Se não der para confirmar, null — nunca chute.
 */
export function normalizeProgress(raw: unknown, meta: number | null, atual: number | null): number | null {
  if (typeof raw === 'string') { const m = raw.match(/(-?\d+(?:[.,]\d+)?)\s*%/); return m ? Number(m[1].replace(',', '.')) : null; }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || meta == null || atual == null || meta === 0) return null;
  const frac = atual / meta;
  if (Math.abs(raw - frac) <= 0.005) return raw * 100;
  if (Math.abs(raw - frac * 100) <= 0.5) return raw;
  return null;
}

const plain = (arr: Json[] | undefined) => (arr ?? []).map((t) => t?.plain_text ?? '').join('').trim() || null;

export function createNotionApiAdapter(opts: ApiAdapterOptions): NotionWriteAdapter {
  if (!opts.token) throw new Error('Token do Notion ausente.');
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? 4;
  const groupMaps = new Map<string, Map<string, NotionStatusGroup | null>>(); // data source → (status option id/nome → grupo)

  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<Json> {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(`${NOTION_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${opts.token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return res.json();
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const ra = Number(res.headers.get('Retry-After'));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** attempt);
        continue;
      }
      // Mensagem segura: status + código da API. O token nunca entra aqui.
      let code = '';
      try { const j = await res.json(); code = j?.code ? `${j.code}${j.message ? `: ${String(j.message).slice(0, 200)}` : ''}` : ''; } catch { /* corpo não é JSON */ }
      const err = new Error(`Notion API ${method} ${path.split('?')[0]} → ${res.status}${code ? ` (${code})` : ''}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
  }

  async function groupMap(dataSourceId: string, statusProp: string) {
    const key = `${normalizePageId(dataSourceId)}|${statusProp}`;
    if (!groupMaps.has(key)) {
      const ds = await call('GET', `/data_sources/${toUuid(dataSourceId)}`);
      const st = ds?.properties?.[statusProp];
      const m = new Map<string, NotionStatusGroup | null>();
      for (const g of st?.status?.groups ?? []) {
        const grp = statusGroupOf(g.name);
        for (const oid of g.option_ids ?? []) m.set(`id:${oid}`, grp);
      }
      for (const o of st?.status?.options ?? []) { const grp = m.get(`id:${o.id}`); if (grp !== undefined) m.set(`name:${o.name}`, grp); }
      groupMaps.set(key, m);
    }
    return groupMaps.get(key)!;
  }

  /** Lista completa de uma propriedade paginada (relação/pessoas com mais de 25 itens). */
  async function fullList(pageId: string, propId: string, kind: 'relation' | 'people'): Promise<string[]> {
    const out: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const q: string = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : '';
      const r = await call('GET', `/pages/${toUuid(pageId)}/properties/${encodeURIComponent(propId)}${q}`);
      for (const it of r?.results ?? []) { const id = kind === 'relation' ? it?.relation?.id : it?.people?.id; if (id) out.push(id); }
      if (!r?.has_more || !r?.next_cursor) break;
      cursor = r.next_cursor;
    }
    return out;
  }

  async function prop(page: Json, name: string, v: Json, groups: Map<string, NotionStatusGroup | null> | null): Promise<NotionPropertyValue | undefined> {
    switch (v?.type) {
      case 'title': return { type: 'title', text: plain(v.title) };
      case 'rich_text': return { type: 'rich_text', text: plain(v.rich_text) };
      case 'status': {
        const s = v.status;
        return { type: 'status', name: s?.name ?? null, group: s ? (groups?.get(`id:${s.id}`) ?? groups?.get(`name:${s.name}`) ?? null) : null };
      }
      case 'select': return { type: 'select', name: v.select?.name ?? null };
      case 'multi_select': return { type: 'multi_select', names: (v.multi_select ?? []).map((o: Json) => o.name) };
      case 'date': return { type: 'date', start: v.date?.start ?? null, end: v.date?.end ?? null };
      case 'people': {
        const ids = (v.people ?? []).map((u: Json) => u?.id).filter(Boolean);
        // A página traz no máximo 25 pessoas; acima disso busca a lista inteira (o responsável pode estar depois).
        const all = ids.length >= 25 ? await fullList(page.id, v.id, 'people') : ids;
        return { type: 'people', ids: all.map(normalizeUserId) };
      }
      case 'number': return { type: 'number', value: typeof v.number === 'number' ? v.number : null };
      case 'relation': {
        const ids = v.has_more ? await fullList(page.id, v.id, 'relation') : (v.relation ?? []).map((r: Json) => r.id);
        return { type: 'relation', ids: ids.map(normalizePageId) };
      }
      case 'formula': {
        const f = v.formula ?? {};
        return { type: 'formula', value: f.type === 'number' ? f.number : f.type === 'string' ? f.string : f.type === 'boolean' ? f.boolean : null };
      }
      case 'last_edited_time': return { type: 'last_edited_time', value: v.last_edited_time };
      default: void name; return undefined;
    }
  }

  async function toPage(raw: Json, source: NotionSource): Promise<NotionPage> {
    const statusProp = source === 'tarefas' ? PROPS.tarefas.status : source === 'krs' ? PROPS.krs.status : null;
    const groups = statusProp ? await groupMap(source === 'tarefas' ? opts.dataSources.tarefas : opts.dataSources.krs, statusProp) : null;
    const properties: NotionPage['properties'] = {};
    for (const [name, v] of Object.entries(raw?.properties ?? {})) properties[name] = await prop(raw, name, v, groups);
    if (source === 'krs') {
      // Fórmula de progresso: converte para 0–100 só se a escala for confirmável pelos próprios Meta/Atual.
      const f = properties[PROPS.krs.progress];
      const n = (k: string) => { const x = properties[k]; return x?.type === 'number' ? x.value : null; };
      if (f?.type === 'formula') properties[PROPS.krs.progress] = { type: 'formula', value: normalizeProgress(f.value, n(PROPS.krs.target), n(PROPS.krs.current)) };
    }
    const parent = raw?.parent ?? {};
    return {
      id: normalizePageId(raw.id),
      url: raw.url ?? null,
      last_edited_time: raw.last_edited_time,
      last_edited_by: raw.last_edited_by?.id ? normalizeUserId(raw.last_edited_by.id) : null,
      archived: !!(raw.archived || raw.in_trash),
      parent_data_source_id: parent.type === 'data_source_id' && parent.data_source_id ? normalizePageId(parent.data_source_id) : null,
      properties,
    };
  }

  async function buildFilter(q: NotionQuery) {
    const and: Json[] = [{ property: q.personProperty, people: { contains: toUuid(q.personId) } }];
    if (q.statusProperty && q.statusGroups?.length) {
      // A API filtra status por NOME; os nomes de cada grupo vêm do schema da base.
      const groups = await groupMap(q.dataSourceId, q.statusProperty);
      const names = [...groups.entries()].filter(([k, g]) => k.startsWith('name:') && g && q.statusGroups!.includes(g)).map(([k]) => k.slice(5));
      if (!names.length) throw new Error(`Nenhuma opção de status encontrada nos grupos ${q.statusGroups.join(', ')} (${q.statusProperty}).`);
      and.push({ or: names.map((n) => ({ property: q.statusProperty, status: { equals: n } })) });
    }
    if (q.editedAfter) and.push({ timestamp: 'last_edited_time', last_edited_time: { after: q.editedAfter } });
    return { and };
  }

  /** Valor normalizado → formato da API. Só os tipos que a integração escreve. */
  const toApi = (v: NotionWriteValue): Json => {
    switch (v.type) {
      case 'title': return { title: [{ type: 'text', text: { content: v.text } }] };
      case 'status': return { status: { name: v.name } };
      case 'select': return { select: { name: v.name } };
      case 'multi_select': return { multi_select: v.names.map((name) => ({ name })) };
      case 'date': return { date: v.start ? { start: v.start, end: v.end ?? null } : null };
      case 'number': return { number: v.value };
    }
  };
  const dsOf = (source: 'tarefas' | 'krs') => (source === 'tarefas' ? opts.dataSources.tarefas : opts.dataSources.krs);
  const statusPropOf = (source: 'tarefas' | 'krs') => (source === 'tarefas' ? PROPS.tarefas.status : PROPS.krs.status);

  return {
    kind: 'api',
    isDemo: false,
    async statusOptions(source) {
      const m = await groupMap(dsOf(source), statusPropOf(source));
      return [...m.keys()].filter((k) => k.startsWith('name:')).map((k) => k.slice(5));
    },
    async body(pageId) {
      return readBody((blockId, cursor) => call('GET', `/blocks/${toUuid(blockId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`), pageId);
    },
    async update(source, pageId, properties) {
      const body = { properties: Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, toApi(v)])) };
      return toPage(await call('PATCH', `/pages/${toUuid(pageId)}`, body), source);
    },
    async query(source, q) {
      if (!q.personId || !q.dataSourceId) throw new Error('Consulta sem responsável ou sem data source — recusada.');
      const body: Json = { filter: await buildFilter(q), page_size: Math.min(q.pageSize ?? 100, 100) };
      if (q.cursor) body.start_cursor = q.cursor;
      const r = await call('POST', `/data_sources/${toUuid(q.dataSourceId)}/query`, body);
      const pages: NotionPage[] = [];
      for (const raw of r?.results ?? []) if (raw?.object === 'page') pages.push(await toPage(raw, source));
      return { pages, next_cursor: r?.has_more ? (r.next_cursor ?? null) : null, has_more: !!r?.has_more };
    },
    async retrieve(source, ids) {
      const out: NotionPage[] = [];
      for (const id of [...new Set(ids.map(normalizePageId))]) {
        try { out.push(await toPage(await call('GET', `/pages/${toUuid(id)}`), source)); }
        catch (e) { if ((e as { status?: number }).status === 404) continue; throw e; } // inexistente/sem acesso: não volta
      }
      return out;
    },
  };
}
