/**
 * Qual leitura/escrita do Notion o app usa:
 * - modo Supabase: Notion REAL, pelo servidor (Edge Function notion-sync; o token fica só lá);
 * - modo local (dados só no navegador): adaptador de DEMONSTRAÇÃO, com dados fictícios em memória.
 */
import { DATA_MODE, supabase } from '@/data/supabaseClient';
import { mockNotionAdapter } from '@/integrations/notion/mockAdapter';
import { createRemoteNotionReader, createRemoteNotionWriter } from '@/integrations/notion/remoteReader';
import { readerFromAdapter, type NotionReader } from '@/integrations/notion/sync';
import type { NotionWriter } from '@/integrations/notion/push';
import { applyPush } from '@/integrations/notion/pushCore';

const invoke = (name: string, opts: { body: Record<string, unknown> }) => supabase().functions.invoke(name, opts);

export const notionReader: NotionReader = DATA_MODE === 'supabase' ? createRemoteNotionReader(invoke) : readerFromAdapter(mockNotionAdapter);
export const notionWriter: NotionWriter = DATA_MODE === 'supabase'
  ? createRemoteNotionWriter(invoke)
  : { isDemo: true, push: (changes, config) => applyPush(mockNotionAdapter, config, changes) };
