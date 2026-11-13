/**
 * Leitura AUTOMÁTICA do Notion (Notion → Central). O envio Central → Notion continua manual, com confirmação.
 *
 * Quando roda: ao abrir o app, ao voltar para ele (aba/celular) e a cada 10 minutos com ele aberto — sempre só se a
 * última leitura tiver mais de 10 minutos. Só com a leitura ativada, a configuração completa e a opção
 * "Ler automaticamente" ligada (padrão: ligada). Nunca roda duas leituras ao mesmo tempo (nem em duas abas).
 * Silenciosa: só avisa se aparecer item novo para revisar/conflito. Erros ficam no log de Integrações.
 */
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { getItems, load } from '@/data/store';
import { useSettings } from '@/app/hooks';
import { useToast } from '@/components/ui/toast';
import type { SyncSummary } from '@/integrations/notion/sync';
import { checkNotionConfig, resolveNotionConfig } from '@/integrations/notion/config';
import type { Settings } from '@/domain/types';

export const AUTO_SYNC_MINUTES = 10;
const INTERVAL_MS = AUTO_SYNC_MINUTES * 60_000;
const LOCK_KEY = 'ccc:notion-auto-at';

let running: Promise<SyncSummary> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Leitura única (botão ou automática): se já houver uma rodando, devolve a mesma. Recarrega as telas no fim. */
export function runNotionSync(settings: Settings, save: (p: Partial<Settings>) => Promise<unknown>, opts: { quiet?: boolean } = {}): Promise<SyncSummary> {
  if (running) return running;
  running = (async () => {
    try {
      // Carregado só na hora da leitura: não pesa na abertura do app.
      const [{ syncNotion }, { notionReader }] = await Promise.all([import('@/integrations/notion/sync'), import('./connection')]);
      const c = await syncNotion(notionReader, settings, save, opts);
      await Promise.all((['tasks', 'objectives', 'notion_sync_state', 'review_queue', 'sync_logs'] as const).map((col) => load(col, true)));
      return c;
    } finally { running = null; emit(); }
  })();
  emit();
  return running;
}

/** true enquanto uma leitura roda (para o botão mostrar "Lendo…"). */
export function useNotionSyncing() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return !!running;
}

/** Puro: a leitura automática está liberada? (última leitura há mais de 10 min, contando também outra aba). */
export function isDue(lastSyncAt: string | null | undefined, lastLocalAttempt: number, now: number): boolean {
  const last = Math.max(Date.parse(lastSyncAt ?? '') || 0, lastLocalAttempt || 0);
  return now - last >= INTERVAL_MS;
}

function readLock(): number { try { return Number(localStorage.getItem(LOCK_KEY)) || 0; } catch { return 0; } }
function writeLock(t: number) { try { localStorage.setItem(LOCK_KEY, String(t)); } catch { /* sem armazenamento: segue */ } }

/** Liga a leitura automática enquanto o app está aberto (montado uma vez, no AppShell). */
export function useNotionAutoSync() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const cfg = resolveNotionConfig(settings);
  const enabled = !!settings.id && settings.notion_enabled && cfg.auto_sync !== false && checkNotionConfig(cfg).ok;
  const ref = React.useRef({ settings, save });
  ref.current = { settings, save };

  React.useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || running || document.visibilityState !== 'visible') return;
      const s = ref.current.settings;
      if (!isDue(resolveNotionConfig(s).last_sync_at, readLock(), Date.now())) return;
      writeLock(Date.now()); // outra aba não começa outra leitura agora
      const pendingBefore = new Set(getItems('review_queue').filter((q) => !q.resolved).map((q) => q.id));
      try {
        await runNotionSync(s, ref.current.save, { quiet: true });
        const fresh = getItems('review_queue').filter((q) => !q.resolved && !pendingBefore.has(q.id)).length;
        if (fresh > 0) toast(`Notion: ${fresh} ${fresh === 1 ? 'item novo' : 'itens novos'} para revisar.`, 'info', { label: 'Ver', onClick: () => navigate('/integracoes') });
      } catch { /* silenciosa: o erro fica registrado no log de Integrações; tenta de novo em 10 min */ }
    };
    const first = window.setTimeout(tick, 4000); // deixa a tela inicial carregar primeiro
    const every = window.setInterval(tick, 60_000); // confere a cada minuto; só lê se passou o intervalo
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
