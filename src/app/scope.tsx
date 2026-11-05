import * as React from 'react';

/** Escopo de instituição global: filtra todas as telas para não misturar dados. */
type Scope = { scope: string; setScope: (s: string) => void; matches: (institutionId: string | null | undefined | string[]) => boolean };
const Ctx = React.createContext<Scope>({ scope: 'all', setScope: () => {}, matches: () => true });
export const useScope = () => React.useContext(Ctx);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScopeState] = React.useState<string>(() => { try { return localStorage.getItem('ccc:scope') ?? 'all'; } catch { return 'all'; } });
  const setScope = (s: string) => { setScopeState(s); try { localStorage.setItem('ccc:scope', s); } catch { /* ignore */ } };
  const matches = React.useCallback((id: string | null | undefined | string[]) => {
    if (scope === 'all') return true;
    if (scope === 'none') return Array.isArray(id) ? id.length === 0 : !id;
    return Array.isArray(id) ? id.includes(scope) : id === scope;
  }, [scope]);
  return <Ctx.Provider value={{ scope, setScope, matches }}>{children}</Ctx.Provider>;
}
