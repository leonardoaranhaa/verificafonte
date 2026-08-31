# Qualidade — checklist de prova

Atualizado junto às correções de robustez (pipeline, HTTPS, probe, BCB).

## Correções nesta rodada

1. **Pipeline (`prepareCasePipeline`)** — cada etapa devolve o próprio status; ordem fixa; `summary` com ok/pulado/erro; não depende de push concorrente em array compartilhado.
2. **Evidências / momentos / claimUrl** — só aceitam **HTTPS público** (bloqueia localhost e IP privado).
3. **`sources.probe`** — usa `safeFetch` (mesma barreira SSRF dos outros conectores).
4. **BCB SGS** — erro explícito se a série vier vazia ou ilegível.

## O que validar antes de chamar de “pronto”

### Ambiente
- [ ] `DATABASE_URL`, `JWT_SECRET`, `OWNER_OPEN_ID` definidos
- [ ] Migrations `0000`–`0008` aplicadas
- [ ] Conta owner vira `admin` no primeiro login
- [ ] Pelo menos um `editor` além do admin (publicação exige revisor **diferente** do autor)

### Fluxos obrigatórios
- [ ] Criar caso por **texto**
- [ ] Criar caso por **link** HTTPS público (extração)
- [ ] Criar caso por **print** (extração)
- [ ] Registrar evidência com URL HTTPS
- [ ] Indexar momento **original** + **viral** (distorção obrigatória)
- [ ] Rodar pipeline (etapas ok/pulado/erro visíveis)
- [ ] Conferir números em alegação com IPCA real (se LLM disponível)
- [ ] Submeter revisão com **outro usuário**
- [ ] Publicar e abrir `/caso/:slug`
- [ ] Rejeitar URL `http://127.0.0.1/...` em evidência

### Comandos
```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

### Limitações honestas (não são bugs de UI)
- YouTube/Whisper dependem de provedor próprio (não Manus)
- Google Fact Check exige `GOOGLE_FACTCHECK_API_KEY`
- Extração de link/print exige `ANTHROPIC_API_KEY`
- RSS Google Notícias pode oscilar ou rate-limitar
