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
| `npm run test:e2e` | teste de fumaça no navegador (Playwright) — requer `npm run dev` ativo e, na primeira vez, `npx playwright install chromium` |
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
VITE_ALLOW_SIGNUP=          # deixe vazio em produção
```

Somente a chave **publicável (anon)** vai no frontend. **Nunca** use a `service_role` aqui.

## Colocar em produção (Supabase + hospedagem)

Nenhum projeto Supabase foi conectado até agora. Passo a passo:

1. **Criar o projeto** no Supabase (um projeto **novo**, região São Paulo de preferência).
2. **Aplicar o esquema**: SQL Editor → colar e executar `supabase/migrations/0001_central_comando.sql`
   (ou `supabase link` + `supabase db push`).
3. **Fechar o cadastro público**: Authentication → Sign In / Providers → desativar *Allow new users to sign up*.
4. **Criar o seu usuário**: Authentication → Users → *Add user* (e-mail e senha forte).
5. **Conferir a segurança**: Advisors → Security Advisor sem alertas de RLS.
6. **Configurar o app**: copiar *Project URL* e a chave *publishable/anon* (Project Settings → API) para o `.env.local`
   (ou para as variáveis de ambiente da hospedagem) com `VITE_DATA_MODE=supabase`.
7. **Publicar**: `npm run build` gera `dist/`. Em Vercel/Netlify: comando `npm run build`, pasta `dist`,
   as mesmas variáveis `VITE_*`, e redirecionar todas as rotas para `index.html` (SPA).
8. **Primeiro acesso**: entrar com o usuário criado. O app cria sozinho as instituições, a rotina-base e as tarefas iniciais.
9. **Migrar dados locais (opcional)**: no modo local, Configurações → *Exportar backup*; no modo Supabase, *Importar backup*.

## Verificações automáticas (GitHub Actions)

`.github/workflows/ci.yml` roda em cada pull request: checagem de tipos, testes unitários, build,
`npm audit` das dependências de produção, migration + RLS num PostgreSQL descartável e o teste de fumaça no Chromium.

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
