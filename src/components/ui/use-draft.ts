import * as React from 'react';

/**
 * Estado de formulário de diálogo: rascunho + erros, reiniciados toda vez que o diálogo abre.
 * `init` monta o rascunho (registro em edição ou valores vazios).
 */
export function useDraft<T extends object>(open: boolean, init: () => T, deps: unknown[] = []) {
  const [d, setD] = React.useState<T>(init);
  const [err, setErr] = React.useState<Record<string, string>>({});
  React.useEffect(() => { if (open) { setD(init()); setErr({}); } }, [open, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  // `v` é solto de propósito: valores de <select>/<input> chegam como string e são validados no salvar.
  const set = React.useCallback((k: keyof T, v: any) => setD((p) => ({ ...p, [k]: v })), []); // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Valida com `rules` (retorna mapa campo → mensagem). Devolve true se não houver erros. */
  const validate = (rules: Record<string, string | false | null | undefined>) => {
    const e = Object.fromEntries(Object.entries(rules).filter(([, v]) => !!v)) as Record<string, string>;
    setErr(e);
    return Object.keys(e).length === 0;
  };
  return { d, setD, set, err, setErr, validate };
}
