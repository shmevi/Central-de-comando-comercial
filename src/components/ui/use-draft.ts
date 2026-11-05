import * as React from 'react';

const sameDeps = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/**
 * Estado de formulário de diálogo: rascunho + erros, reiniciados toda vez que o diálogo abre
 * (ou quando `deps` muda com ele aberto). `init` monta o rascunho (registro em edição ou valores vazios).
 *
 * O reinício acontece DURANTE a renderização (padrão "ajustar estado ao mudar props" do React), e não num
 * useEffect: assim o diálogo já aparece com os dados certos no primeiro desenho, sem piscar o conteúdo antigo.
 */
export function useDraft<T extends object>(open: boolean, init: () => T, deps: unknown[] = []) {
  const [d, setD] = React.useState<T>(init);
  const [err, setErr] = React.useState<Record<string, string>>({});
  const [snap, setSnap] = React.useState<{ open: boolean; deps: unknown[] }>({ open: false, deps: [] });
  if (open && (!snap.open || !sameDeps(snap.deps, deps))) {
    setSnap({ open: true, deps });
    setD(init());
    setErr({});
  } else if (!open && snap.open) {
    setSnap({ open: false, deps: [] });
  }
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
