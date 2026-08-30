# VerificaFonte

Plataforma editorial para transformar alegações (texto, link ou print) em casos de checagem verificáveis: extração assistida por IA, evidências rastreáveis e decisão de publicação sempre humana.

Veja `FLOW.md` para o fluxo de apuração ponta a ponta, `ESTADO_ATUAL.md` para o estado funcional detalhado e `AGENT_INTEGRATION.md` para o contrato de integração com agentes de pesquisa externos.

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
- `OWNER_OPEN_ID` — **obrigatório na primeira instalação**; `openId` (`email:seu@email.com`) promovido a `admin` automaticamente. Sem nenhum admin, ninguém consegue liberar acesso à bancada e o painel fica inacessível — ver "Acesso e papéis".
- `APP_URL` — URL pública do app (ex.: `https://verificafonte.up.railway.app`); usada para montar o redirect do login com Google. Em dev local pode ficar vazia.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — opcionais; sem eles, o botão "Continuar com Google" retorna erro no backend, mas o login por e-mail/senha funciona normalmente. Para habilitar, crie um OAuth Client ID (tipo "Web application") no [Google Cloud Console](https://console.cloud.google.com/apis/credentials) com o URI de redirecionamento autorizado `<APP_URL>/api/oauth/google/callback`.
- `GOOGLE_FACTCHECK_API_KEY` — opcional; habilita a busca por checagens já publicadas (ClaimReview) via [Fact Check Tools API](https://developers.google.com/fact-check/tools/api). Sem a chave, essa etapa do fluxo é reportada como "pulada" e as demais continuam funcionando. O conector do Banco Central (SGS) é público e não exige credencial.

## Acesso e papéis

O cadastro é aberto, mas **criar uma conta não dá acesso à bancada editorial**. Uma conta nova
não lê, não edita e não publica caso nenhum — ela só enxerga o acervo público.

| Papel | O que pode fazer |
|---|---|
| `user` (padrão do cadastro) | Apenas o acervo público. Sem acesso ao painel. |
| `editor` | Bancada completa: criar casos, registrar evidências e momentos, rodar pesquisa, revisar e publicar. |
| `admin` | Tudo o que o editor faz, mais a aba **Equipe**, onde concede e revoga acesso. |

**Primeiro acesso de uma instalação nova:**

1. Defina `OWNER_OPEN_ID=email:voce@dominio.com`.
2. Cadastre-se (ou faça login) com esse mesmo e-mail — a conta é promovida a `admin` no login.
3. Abra **Painel → Equipe** e promova quem é da redação a `editor`.

Se nenhuma conta for `admin`, o servidor registra um aviso no log na subida dizendo exatamente
isso e qual é o valor atual de `OWNER_OPEN_ID`.

**Publicação exige revisão independente:** um caso só vai ao ar com uma revisão aprovada por
alguém **diferente de quem o criou**. O autor aprovando o próprio caso não publica — é a
garantia editorial que o produto anuncia ao leitor, e ela é aplicada no backend.

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
