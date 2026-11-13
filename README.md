# Central de Comando Comercial

Painel de gestão da coordenação comercial do **CPPEM**, **UNICIVE** e **Colégio CPPEM**.
Interface em português (pt-BR), moeda em BRL, datas dd/mm/aaaa e fuso **America/Recife**.

> Jornada configurada: seg–sex, 12h12–22h, intervalo 18h–19h → **8h48/dia (528 min)** e **44h/semana**.

## Rodar no seu computador

Requer **Node.js 20.19 ou mais novo** (recomendado 22; veja `.nvmrc`).

```bash
npm install
npm run dev                  # abre em http://localhost:5173 (modo local: dados no navegador)
```

Para usar o Supabase no seu computador, copie `.env.example` para `.env.local` e preencha (veja abaixo).

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | checagem de tipos + build de produção em `dist/` |
| `npm run check` | tudo o que o CI confere rápido: tipos, testes, cabeçalhos e build |
| `npm test` | testes unitários (Vitest) |
| `npm run test:e2e` | build de produção + teste no Chromium (modo local, com os cabeçalhos de segurança) |
| `npm run test:supabase` | build em modo Supabase + teste no Chromium contra um Supabase simulado (login, senha, banco) |
| `npm run test:rls` | aplica a migration num PostgreSQL descartável e testa as regras de acesso (RLS) |
| `npm run sync:headers` | regenera `vercel.json` e `netlify.toml` a partir de `security-headers.json` |

Na primeira vez que for rodar os testes de navegador: `npx playwright install chromium`.

## Onde os dados ficam

| `VITE_DATA_MODE` | Resultado |
|---|---|
| `local` | Navegador (`localStorage`). O cabeçalho mostra **“Dados só neste navegador”**. |
| `supabase` | Banco PostgreSQL no Supabase, com login. Se a URL ou a chave faltarem, o app **para e explica** — não cai para o modo local escondido. |
| vazio | Supabase se a URL e a chave existirem; senão, local. |

### Variáveis de ambiente

```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://<id-do-projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...     # ou a chave "anon" legada
VITE_ALLOW_SIGNUP=                                    # deixe vazio em produção
```

- Só a chave **publicável** (`sb_publishable_…` ou `anon`) vai no app. Se alguém colar a chave **secreta**
  (`sb_secret_…` ou `service_role`), o app **se recusa a iniciar** e avisa.
- As variáveis `VITE_*` são gravadas no build: depois de mudar alguma na Vercel/Netlify, **publique de novo**.

## Colocar em produção

Nenhum projeto Supabase foi criado ou conectado por este repositório. Siga na ordem:

### 1. Supabase (banco e login)

1. Em [supabase.com/dashboard](https://supabase.com/dashboard), crie um **projeto novo** (região *South America (São Paulo)*). Guarde a senha do banco.
2. **Criar as tabelas** — menu **SQL Editor** → *New query* → rode, **em ordem**, cada arquivo de `supabase/migrations/`:
   - `0001_central_comando.sql` — esquema base + RLS. Rode **uma vez só** (rodar de novo dá erro “already exists”).
   - `0002_notion_sync.sql` — sincronização Notion (`notion_sync_state`, fila de revisão).
   - `0003_relatorios_e_logo.sql` — conquistas/anotações dos relatórios (`report_entries`), coluna `settings.logo_path`
     e o bucket privado **branding** do Storage (logo personalizada), com regras por usuário. Não apaga nada; pode ser reaplicada.
   - `0004_logo_5mb.sql` — aumenta o limite da logo no bucket `branding` para 5 MB (só um UPDATE).
   - `0005_notion_access.sql` — vínculo conta ↔ pessoa no Notion (quem pode ler o Notion pela Central). Depois de aplicar,
     libere cada conta no SQL Editor: `insert into public.notion_access (user_id, person_id) select id, '<id-no-notion>' from auth.users where email = '<e-mail>';`
   - `0006_tarefas_atribuicao.sql` — coluna `tasks.attribution` (ATRIBUIÇÃO 70% / 20% / 10% / OFF WORK, como no Notion). Só adiciona.
   - `0007_person_metrics.sql` — Feedback em números: tabela `person_metrics` (leads, matrículas e valor por pessoa × instituição ×
     mês, com RLS) e `feedbacks.metrics_snapshot` (números congelados no feedback). Só adiciona; pode ser reaplicada.
   - `0008_rotina_dias_sem_blocos.sql` — coluna `settings.routine_off_dates` (dias marcados como "Dia de folga" na Rotina:
     a rotina-base não é recriada sozinha). Só adiciona; pode ser reaplicada.
3. **Fechar o cadastro público** — **Authentication → Sign In / Providers** → desligue **Allow new users to sign up**.
   Deixe **Email** ligado e **Confirm email** ligado.
4. **Criar o seu usuário** — **Authentication → Users → Add user → Create new user**: e-mail, senha forte e marque
   **Auto Confirm User**. Repita para cada pessoa que vai usar o sistema (cada uma terá os próprios dados).
5. **Endereços do site** (necessário para “Esqueci minha senha”) — **Authentication → URL Configuration**:
   - **Site URL**: o endereço final do site, ex.: `https://central-comercial.vercel.app`
   - **Redirect URLs**: o mesmo endereço e, se quiser testar no computador, `http://localhost:5173`
6. **E-mails de produção** — o envio de e-mail padrão do Supabase é só para testes (poucos e-mails por hora).
   Para recuperação de senha confiável, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.
7. **Conferir a segurança** — **Advisors → Security Advisor** não deve mostrar alertas de RLS nas tabelas do app.
8. **Pegar a URL e a chave** — botão **Connect** no topo do projeto (ou **Project Settings → API Keys**):
   copie a **Project URL** e a **Publishable key**.

### 2. Vercel ou Netlify (site)

O repositório já tem `vercel.json` e `netlify.toml` prontos (build, rotas internas como `/tarefas` e cabeçalhos de segurança).

**Vercel:** *Add New → Project* → importe o repositório do GitHub → o framework **Vite** é detectado sozinho →
em **Environment Variables** cadastre `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` → **Deploy**.

**Netlify:** *Add new site → Import an existing project* → escolha o repositório → as configurações de build vêm do
`netlify.toml` → em **Site configuration → Environment variables** cadastre as mesmas três variáveis → **Deploy**.

Depois do primeiro deploy, copie o endereço do site para o passo 1.5 (Site URL / Redirect URLs).

### 3. Primeiro acesso

Abra o site e entre com o usuário do passo 1.4. O sistema cria sozinho as 3 instituições, a rotina-base e as tarefas
iniciais (04, 05 e 06/11/2026). Se você já usava o modo local: **Configurações → Exportar backup** no navegador antigo e
**Importar backup** depois de entrar no Supabase.

## Personalização

- **Logo:** Configurações → Identidade visual → *Escolher imagem* (PNG, JPG/JPEG ou WEBP; até 5 MB no Supabase).
  Fica no Storage (bucket privado `branding`, pasta da sua conta) e aparece em todos os seus dispositivos. *Remover logo
  personalizada* volta ao monograma CP. No modo local, a imagem fica só no navegador (até 1 MB).
  A logo também vira o **ícone do app** (aba do navegador e atalho na tela inicial do celular, via `src/app/appIcon.ts`).
  O celular grava o ícone quando o atalho é criado: depois de trocar a logo, remova o atalho e adicione de novo.
- **Fonte de identidade (Capture It):** usada nos títulos (páginas, cartões, marca); o texto corrido usa Inter, mais legível em tamanho pequeno. Arquivo em `src/assets/fonts/capture-it.woff2`
  (ou `.woff`/`.ttf`) — veja `src/assets/fonts/README.md` e a licença ao lado. Sem o arquivo, o app usa Inter e Barlow Condensed, sem erro.

## Segurança (resumo)

- **RLS** forçado em todas as tabelas: cada usuário só lê e altera as próprias linhas; o `user_id` é definido pelo banco.
- Referências entre tabelas (instituição, pessoa, candidato, sistema) precisam ser do **mesmo usuário**.
- Acesso anônimo (sem login) revogado em todas as tabelas.
- Cabeçalhos de produção: `Content-Security-Policy` (só o próprio site e `*.supabase.co`), sem iframes de terceiros,
  `nosniff`, HSTS. Fontes embutidas no app (nenhuma chamada ao Google Fonts).
- Notion: leitura e envio pelo servidor (token só no Edge Secret `NOTION_TOKEN`), apenas para contas vinculadas em `notion_access`.
  O envio Central → Notion exige "Autorizar escrita no Notion" ligado e confirmação a cada envio; só altera campos de tarefas/KRs
  do próprio responsável, nunca cria ou apaga páginas, e não sobrescreve o que mudou no Notion (vira conflito).

## Estrutura

```
src/
  app/            providers (auth, escopo de instituição), hooks, navegação
  components/
    ui/           design system: botões, diálogos, campos, Kanban, busca, navegação de datas, useDraft
    layout/       AppShell (menu, cabeçalho, navegação móvel), monograma CP
    domain/       componentes de domínio (instituição)
  data/           camada de dados: config, Repository, LocalRepository, SupabaseRepository, store, seed
  domain/         tipos (modelo de dados), rótulos, valores padrão
  features/       lógica e diálogos por módulo (tarefas, rotina, recrutamento, relatórios)
  integrations/   Notion: contrato do adaptador, adaptador de demonstração, sincronização
  lib/            datas/fuso, jornada, conflitos, OKR, PIN, convite WhatsApp
  pages/          uma tela por módulo
supabase/         migrations 0001–0008 (esquema, Notion, relatórios/logo, vínculo Notion, atribuição, números da equipe, dias sem rotina + RLS e Storage), Edge Function notion-sync e testes de RLS
e2e/              testes no navegador e servidor que imita a hospedagem
scripts/          gerador de vercel.json / netlify.toml
docs/             arquitetura, checklist de testes, status funcional
```

Documentação: [Arquitetura e modelo de dados](docs/ARQUITETURA.md) · [Checklist de testes](docs/CHECKLIST.md) · [O que é funcional × demonstração](docs/STATUS.md)
