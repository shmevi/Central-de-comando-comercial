# Central de Comando Comercial

Painel de gestão da coordenação comercial do **CPPEM**, **UNICIVE** e **Colégio CPPEM**.
Interface em português (pt-BR), moeda em BRL, datas dd/mm/aaaa e fuso **America/Recife**.

> Jornada configurada: seg–sex, 12h12–22h, intervalo 18h–19h → **8h48/dia (528 min)** e **44h/semana**.

## Começar

```bash
npm install
cp .env.example .env.local   # opcional — sem Supabase o app roda em modo local
npm run dev                  # http://localhost:5173
```

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (Vite) |
| `npm run build` | checagem de tipos + build de produção em `dist/` |
| `npm run preview` | serve o build |
| `npm test` | testes unitários (Vitest) |
| `npm run test:e2e` | teste de fumaça no navegador (Playwright) — requer `npm run dev` ativo |
| `npm run test:rls` | aplica a migration num PostgreSQL local descartável e testa RLS/integridade |

### Modos de persistência

| Modo | Quando | Onde ficam os dados |
|---|---|---|
| **Local** (padrão) | sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` | `localStorage` do navegador (sobrevive a recarregar) |
| **Supabase** | variáveis preenchidas e `VITE_DATA_MODE=supabase` | PostgreSQL com RLS por usuário; login por e-mail/senha |

### Variáveis de ambiente (`.env.local`)

```
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave publicável / anon>
VITE_DATA_MODE=supabase
```

Somente a chave **publicável (anon)** vai no frontend. **Nunca** use a `service_role` aqui.
Nenhum projeto Supabase foi conectado. Para ativar: crie um projeto **novo** (ou um que você indicar),
aplique `supabase/migrations/0001_central_comando.sql` (SQL Editor ou `supabase db push`) e preencha o `.env.local`.

## Estrutura

```
src/
  app/            providers (auth, escopo de instituição), hooks, navegação
  components/
    ui/           design system (Button, Dialog, campos, estados vazios/erro/loading, toast)
    layout/       AppShell (sidebar, cabeçalho, navegação móvel), monograma CP
    domain/       componentes de domínio (badge/seletor de instituição)
  data/           camada de dados: Repository, LocalRepository, SupabaseRepository, store reativo, seed
  domain/         tipos (modelo de dados), rótulos, valores padrão
  features/       lógica e diálogos por módulo (tarefas, rotina, recrutamento, relatórios)
  integrations/   Notion: contrato do adaptador, adaptador de demonstração, sincronização
  lib/            datas/fuso, jornada, conflitos, OKR, convite WhatsApp (com testes)
  pages/          uma tela por módulo
  styles/         tokens.css (tokens de cor) + index.css
supabase/migrations/   esquema SQL com RLS
e2e/                   teste de fumaça
docs/                  arquitetura, checklist de testes, status funcional
```

Documentação: [Arquitetura e modelo de dados](docs/ARQUITETURA.md) · [Checklist de testes](docs/CHECKLIST.md) · [O que é funcional × demonstração](docs/STATUS.md)
