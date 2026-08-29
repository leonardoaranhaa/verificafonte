# VerificaFonte

Plataforma editorial para transformar alegações (texto, link ou print) em casos de checagem verificáveis: extração assistida por IA, evidências rastreáveis e decisão de publicação sempre humana.

Veja `ESTADO_ATUAL.md` para o estado funcional detalhado e `AGENT_INTEGRATION.md` para o contrato de integração com agentes de pesquisa externos.

## Stack

React 19 + Vite + Tailwind CSS 4 no cliente, Express + tRPC 11 + Drizzle ORM (MySQL) no servidor, autenticação nativa por e-mail/senha e login com Google (JWT em cookie httpOnly), extração de alegações via API da Anthropic.

## Configuração

```bash
pnpm install
cp .env.example .env
```

Preencha no `.env`:

- `DATABASE_URL` — string de conexão MySQL/TiDB.
- `JWT_SECRET` — segredo para assinar a sessão (qualquer string longa e aleatória).
- `ANTHROPIC_API_KEY` — chave da API da Anthropic, usada para extrair alegações de links e prints.
- `ANTHROPIC_MODEL` — opcional; usa um modelo padrão se omitido.
- `OWNER_OPEN_ID` — opcional; `openId` (`email:seu@email.com`) que deve receber a role `admin` automaticamente.
- `APP_URL` — URL pública do app (ex.: `https://verificafonte.up.railway.app`); usada para montar o redirect do login com Google. Em dev local pode ficar vazia.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — opcionais; sem eles, o botão "Continuar com Google" retorna erro no backend, mas o login por e-mail/senha funciona normalmente. Para habilitar, crie um OAuth Client ID (tipo "Web application") no [Google Cloud Console](https://console.cloud.google.com/apis/credentials) com o URI de redirecionamento autorizado `<APP_URL>/api/oauth/google/callback`.

## Banco de dados

```bash
pnpm db:push
```

Gera e aplica as migrations do Drizzle (`drizzle/schema.ts`) contra o `DATABASE_URL` configurado.

## Desenvolvimento

```bash
pnpm dev
```

## Verificações

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm run build
```

## Deploy

Configurado para Railway via `railway.toml` / `nixpacks.toml`, com CI (typecheck, testes e build) em `.github/workflows/ci.yml`.
