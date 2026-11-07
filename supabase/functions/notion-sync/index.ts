// Edge Function notion-sync — DRY-RUN somente (lê o Notion e devolve o plano; não grava em lugar nenhum).
// A lógica fica em src/integrations/notion/serverHandler.ts (testada no Vitest). Este arquivo só liga ao Deno.
//
// Deploy: `npm run build:edge` gera dist/index.js (bundle único, sem dependências externas) e é ele que vai
// para o Supabase. Segredo necessário: NOTION_TOKEN (Edge Secret). Nunca em VITE_*, banco, GitHub ou log.
import { handleNotionSync } from '@/integrations/notion/serverHandler';

declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => unknown; env: { get: (k: string) => string | undefined } };

Deno.serve((req) => handleNotionSync(req, { env: (k) => Deno.env.get(k) }));
