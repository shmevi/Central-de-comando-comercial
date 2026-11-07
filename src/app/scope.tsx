import * as React from 'react';
import { isPersonalNotion } from '@/integrations/notion/mapping';

type InstId = string | null | undefined | string[];
type ScopedItem = { institution_id?: string | null; external_ref?: string | null };

/** Regra do filtro por instituição (pura, testável). */
export function scopeMatches(scope: string, id: InstId): boolean {
  if (scope === 'all') return true;
  if (scope === 'none') return Array.isArray(id) ? id.length === 0 : !id;
  return Array.isArray(id) ? id.includes(scope) : id === scope;
}
/**
 * Igual a `scopeMatches`, com UMA exceção: itens pessoais sincronizados do Notion (external_ref "notion:…" e sem
 * instituição) aparecem em qualquer filtro — eles não pertencem a nenhuma instituição e nenhuma é inventada.
 * Registros normais da Central seguem exatamente a regra antiga.
 */
export function scopeMatchesItem(scope: string, item: ScopedItem): boolean {
  return isPersonalNotion(item) || scopeMatches(scope, item.institution_id);
}

/** Escopo de instituição global: filtra todas as telas para não misturar dados. */
type Scope = { scope: string; setScope: (s: string) => void; matches: (institutionId: InstId) => boolean; matchesItem: (item: ScopedItem) => boolean };
const Ctx = React.createContext<Scope>({ scope: 'all', setScope: () => {}, matches: () => true, matchesItem: () => true });
export const useScope = () => React.useContext(Ctx);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScopeState] = React.useState<string>(() => { try { return localStorage.getItem('ccc:scope') ?? 'all'; } catch { return 'all'; } });
  const setScope = (s: string) => { setScopeState(s); try { localStorage.setItem('ccc:scope', s); } catch { /* ignore */ } };
  const matches = React.useCallback((id: InstId) => scopeMatches(scope, id), [scope]);
  const matchesItem = React.useCallback((item: ScopedItem) => scopeMatchesItem(scope, item), [scope]);
  return <Ctx.Provider value={{ scope, setScope, matches, matchesItem }}>{children}</Ctx.Provider>;
}
