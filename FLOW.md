# VerificaFonte — fluxo completo de apuração

## Configuração

```bash
JWT_SECRET=...                  # obrigatório: assina a sessão
DATABASE_URL=...                # obrigatório: MySQL
ANTHROPIC_API_KEY=...           # extração de link/print e briefings
GOOGLE_FACTCHECK_API_KEY=...    # opcional: checagens já publicadas (ClaimReview)
GOOGLE_CLIENT_ID=...            # opcional: login com Google
GOOGLE_CLIENT_SECRET=...
```

O conector do Banco Central (SGS) não exige credencial — é API pública.

## Fluxo editorial (ponta a ponta)

1. **Entrada** (Home)
   - Texto / mensagem colada
   - Link HTTPS público
   - Print (imagem)

2. **Preview da extração** → o editor confirma a alegação → cria rascunho

3. **Painel → Rodar fluxo completo** (`research.prepareCasePipeline`)
   - **Google Fact Check** (ClaimReview) → checagens já publicadas por outros veículos
   - **Fontes oficiais** → busca restrita a `.gov.br`, `.jus.br`, `.leg.br` e Agência Brasil
   - **BCB SGS** → quando a alegação cita IPCA, Selic, CDI ou câmbio, puxa a série oficial

   Cada etapa reporta `ok`, `pulado` ou `erro` — o editor vê exatamente o que rodou e o que
   faltou configurar. Nenhuma etapa registra veredito.

4. **Refino manual**
   - Indexar **momentos**: prova original (com o instante da fala) × versão viral
   - **Laudo "fulano disse isso?"** (`analysis.quoteLaudo`) — avalia atribuição da fala e uso
     fora de contexto; produz material para o editor, não veredito
   - Ajustar a relação das evidências (apoia / contradiz / contextualiza / neutra)

5. **Publicação**
   - Metodologia + nota editorial preenchidas
   - Revisão humana aprovada registrada
   - Status: `em_apuracao` | `confirmado` | `divergente` | `insuficiente`

## Princípio

Agentes e APIs **preparam material**.
O **veredito público** é sempre humano — a barreira é aplicada no backend, não só na interface.

## Prova original × distorção

O ponto central do produto: em vez de um rótulo binário, o leitor vê os dois lados.

1. Indexe a **prova original** (vídeo/post/áudio) com URL e, quando houver, o **instante em
   segundos**. Em vídeos do YouTube o link publicado já abre no instante indexado.
2. Indexe a **versão viral** com descrição obrigatória da distorção (corte, omissão, manchete).
   O backend recusa uma versão viral sem essa descrição.
3. Vincule a viral ao ID da prova original — o vínculo só é aceito se o momento alvo pertencer
   ao mesmo caso e estiver marcado como `original`.
4. Na página pública, as duas colunas aparecem lado a lado: o instante original e o que circulou.

Cada momento pode ser espelhado na trilha de evidências (`mirrorAsEvidence`), com a relação
sugerida automaticamente: `contradiz` para a versão viral, `contextualiza` para a original.

## O que ainda não roda aqui

A busca de fala original no YouTube e a transcrição por Whisper dependiam do proxy interno da
plataforma Manus (`BUILT_IN_FORGE_API_URL`), que não existe neste deploy standalone. As demais
etapas do fluxo funcionam sem ele. Para reativá-las seria preciso um provedor próprio de busca
de vídeo e de transcrição.
