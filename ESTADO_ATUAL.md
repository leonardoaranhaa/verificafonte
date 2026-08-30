# VerificaFonte — estado atual do projeto

**Data do estado:** 29 de agosto de 2026  
**Versão de referência:** checkpoint `ba854df3` como base, com as extensões de fontes por caso, simulação de retorno e documentação descritas abaixo.  
**Autor:** Manus AI

## Visão geral

O VerificaFonte é um MVP de plataforma editorial para transformar alegações em casos verificáveis. O produto separa quatro camadas que não devem ser confundidas: a alegação original, as evidências rastreáveis, o apoio automatizado à análise e a decisão editorial humana.

A interface foi construída como uma bancada de apuração com identidade visual editorial: navy profundo, papel quente, coral para ações decisivas, tipografia serifada para manchetes e metadados monoespaçados para fontes, estados e trilhas de auditoria. A página pública prioriza contexto e justificativa, em vez de apresentar apenas um rótulo binário.

> **Princípio central:** modelos de linguagem podem extrair, organizar, resumir e apontar divergências; não podem escolher o veredito final nem publicar um caso.

## Funcionalidades entregues

| Área | Estado atual | Como funciona |
|---|---|---|
| Entrada de alegação | Entregue | Editor pode criar um caso por texto e opcionalmente informar a URL de origem. O caso recebe slug consultável. |
| Evidências | Entregue | Cada evidência registra título, URL, nome e tipo da fonte, data, contexto, trecho e relação com a alegação. |
| Status | Entregue | O caso diferencia `em apuração`, `confirmado`, `divergente` e `insuficiente`. O status não é inferido automaticamente pelo modelo. |
| Revisão | Entregue | Revisões humanas registram decisão, nota e identidade do revisor. A publicação exige revisão aprovada. |
| Publicação | Entregue | Casos publicados exibem alegação, resultado, justificativa pública, metodologia e trilha de fontes. |
| Apoio de linguagem | Entregue no código | A rota server-side seleciona um modelo disponível em runtime e solicita JSON estruturado com extração, resumo, divergências e briefing. |
| Fontes autorizadas | Entregue | Catálogo com nome, endpoint, tipo, modo de acesso e status ativo/pausado; endpoints HTTPS públicos podem ser testados. |
| Prioridade por caso | Entregue | Uma fonte pode ser vinculada ao caso com prioridade e ativação próprias. |
| Orquestração | Entregue | A bancada cria tarefas por papel (`orquestrador`, `navegador`, `triagem`) e oferece uma simulação de retorno que transforma resposta de endpoint público em evidência. |
| Integração externa | Contrato pronto | `AGENT_INTEGRATION.md` documenta o fluxo para um provedor autorizado devolver achados via ação protegida, sem acesso ao veredito. |

## Arquitetura técnica

A aplicação usa React 19, Vite, Tailwind CSS 4, Express, tRPC 11, Drizzle ORM, MySQL/TiDB e autenticação Manus OAuth. Os contratos tRPC são definidos em `server/routers.ts`; as operações de banco ficam em `server/db.ts`; o modelo persistente está em `drizzle/schema.ts`; as telas principais estão em `client/src/pages/`.

As tabelas específicas do domínio são `fact_check_cases`, `evidences`, `case_reviews`, `case_analyses`, `source_connections`, `source_case_links` e `research_tasks`. A migração inicial foi aplicada e a migração `0003_sharp_quentin_quire.sql` criou o vínculo entre fontes e casos sem operações destrutivas.

### Barreiras relevantes

A rota de publicação verifica no backend se existe revisão humana aprovada e se metodologia e justificativa pública estão preenchidas. A interface também impede a seleção de publicação quando esses campos estão vazios. Endpoints de consulta e ingestão rejeitam protocolos que não sejam HTTPS e alguns padrões de rede local, aplicam timeout e limitam o trecho textual salvo.

A ingestão de endpoint é tratada como retorno bruto para leitura editorial. O sistema não apresenta o retorno como verdade apenas porque foi capturado, e uma reportagem não substitui a fonte primária correspondente.

## Caso econômico validado

Foi criado um caso privado com a seguinte alegação real, baseada em uma publicação econômica do g1:

> “Segundo dados divulgados pelo IBGE, o IPCA subiu 0,07% em julho de 2026, acumulando 3,44% no ano e 4,44% em 12 meses.”

Foram registradas duas evidências. A primeira é o release oficial do IBGE, complementado pelo PDF oficial **Indicadores IBGE — IPCA e INPC — Julho de 2026**. A segunda é a reportagem do g1 que atribui os números ao IBGE e fornece contexto jornalístico. O PDF oficial confirma 0,07% no mês, 3,44% no acumulado do ano e 4,44% nos doze meses [1]. A reportagem apresenta os mesmos valores e informa a comparação com junho [2].

Após a conferência do PDF primário, foi registrada uma revisão humana aprovada. O caso foi publicado com o status **Confirmado por fontes**, metodologia explícita e justificativa pública. A página pública foi aberta e exibiu duas evidências, o link de origem da alegação, a trilha de fontes e a nota de publicação revisada.

### Endereço público do caso

`/caso/segundo-dados-divulgados-pelo-ibge-o-ipca-subiu-0-07-em-julho-de-2026-acumulando-3-44-no-ano-e-4-44-em-12-mese-gwtijp-`

O endereço completo está disponível no preview do projeto e também foi registrado nas notas de validação.

## Testes e validações

A checagem TypeScript, o build de produção e a suíte Vitest foram executados após as últimas alterações.

| Verificação | Resultado |
|---|---|
| `pnpm check` | Passou sem erros TypeScript |
| `pnpm build` | Passou; Vite e bundle server gerados |
| `pnpm test` | 2 arquivos, 6 testes, todos passaram |
| Rotas públicas | Home, acervo e caso público carregaram |
| Barreira editorial | `/painel` sem sessão mostrou corretamente a exigência de autenticação |
| Caso não vazio | Caso IPCA foi aberto no navegador com status e 2 evidências |
| Publicação | Bloqueada no backend sem revisão aprovada, metodologia e justificativa |

O build emite apenas um aviso de tamanho de bundle JavaScript acima de 500 kB. Isso não impediu a geração nem os testes, mas pode ser tratado com code splitting em uma etapa de otimização.

## Limitações conhecidas

O provedor de modelos retornou `412 Precondition Failed` com indicação de uso esgotado quando o briefing assistido foi executado nesta sessão. O caso não foi decidido pelo modelo: a análise automatizada não foi salva como se tivesse sido produzida, e a decisão publicada foi registrada por revisão humana com base no PDF oficial e na reportagem contextual.

A integração com um serviço real de agentes de navegação ainda é agnóstica. O MVP já oferece persistência de tarefas, seleção de fontes, simulação integrada de retorno e o contrato `research.recordFinding`, mas não contém credenciais, callback ou conector proprietário de um provedor específico. Isso é intencional até a definição do serviço autorizado, da política de retenção e dos escopos de acesso.

A leitura automatizada da página HTML do release do IBGE apresentou instabilidade durante a consulta. Por isso, o PDF oficial foi usado como referência primária confirmatória. O sistema registra essa limitação na evidência pública, em vez de ocultá-la.

A validação manual autenticada da bancada foi limitada pela ausência de uma sessão ativa no navegador. O fluxo server-side de criação, evidência, revisão e publicação foi exercitado com o caso real, e a página pública resultante foi validada no navegador.

## Próximos passos recomendados

A primeira próxima etapa é escolher o provedor autorizado para navegação e implementar seu callback autenticado e idempotente. O contrato deve entregar somente tarefas e achados, mantendo o revisor humano como única autoridade para o status e para a publicação.

Depois, recomenda-se adicionar gestão segura de credenciais por conector, escopos por workspace, logs de consulta, limites de taxa, verificação de DNS/SSRF mais abrangente e uma política de retenção. Também vale dividir o bundle frontend para reduzir o aviso de tamanho e adicionar testes de integração com um endpoint controlado.

## Referências

[1]: https://biblioteca.ibge.gov.br/visualizacao/periodicos/236/inpc_ipca_2026_jul.pdf "Indicadores IBGE — IPCA e INPC — Julho de 2026"  
[2]: https://g1.globo.com/economia/noticia/2026/08/11/ipca-inflacao-julho.ghtml "IPCA: Inflação desacelera para 0,07% em julho com queda nos preços dos alimentos — g1"  
[3]: https://agenciadenoticias.ibge.gov.br/agencia-de-noticias/2013-agencia-de-noticias/releases/47739-ipca-fica-em-0-07-em-julho "IPCA fica em 0,07% em julho — IBGE"  

## Atualização — agentes com pesquisa histórica

Após o estado inicial, a bancada de orquestração passou a oferecer `research.discover`. O agente cria uma tarefa de navegação e consulta o RSS público do Google Notícias usando termo, idioma e janela de datas de até 366 dias. A resposta apresenta candidatos com título, veículo, data de publicação, URL de descoberta, URL final quando resolvida, provedor e data de consulta.

A interface deixa claro que a descoberta não é evidência confirmatória. O editor precisa abrir a matéria original e clicar em registrar antes que o candidato entre na trilha do caso. URLs são normalizadas para remover fragmentos e parâmetros comuns de rastreamento; candidatos duplicados são descartados. A consulta foi testada com `IPCA` entre 01/08/2026 e 29/08/2026 e retornou candidatos reais.

A busca GDELT DOC 2.0 foi avaliada como opção de arquivo jornalístico, mas não respondeu dentro do timeout deste ambiente. O MVP, portanto, usa Google Notícias RSS para descoberta e mantém a confirmação dependente da fonte original. O fluxo continua sem acesso do agente a status, veredito, revisão ou publicação.

## Atualização — persistência dos achados

Os candidatos retornados pela descoberta histórica agora são gravados em `historical_findings`, com `discoveryUrl`, `finalUrl`, `title`, `publisher`, `publishedAt`, `accessedAt`, `needsEditorialOpen`, vínculo com a tarefa e vínculo posterior à evidência. O botão editorial usa `research.recordFinding`; ao registrar um achado, a evidência é criada e o achado passa a indicar `needsEditorialOpen = nao` e seu `registeredEvidenceId`.

A tabela foi criada pela migração `0004_past_dracula.sql`; como o primeiro índice em `TEXT` foi rejeitado pelo banco, a coluna `finalUrl` foi corrigida para `varchar(2048)` e a migração incremental `0005_marvelous_stingray.sql` foi gerada e aplicada. A descoberta real do caso IPCA retornou cinco candidatos e criou o primeiro registro persistido.

## Atualização — cruzamento com fontes oficiais em um clique

O intake multimodal (texto/link/print) extrai a alegação, mas até aqui o cruzamento com fontes exigia que o editor preenchesse manualmente termo, datas e domínios na aba Orquestração. A rota `research.crossCheckOfficial` fecha esse laço: a partir do texto da própria alegação (ou de um termo alternativo, se informado), monta uma busca no RSS do Google Notícias restrita por `site:` a um catálogo de domínios `.gov.br`, `.jus.br`, `.leg.br` e `ebc.com.br` (IBGE, Banco Central, Planalto, Anvisa, TSE, STF, Câmara, Senado, Agência Brasil), na janela dos últimos 180 dias. Reaproveita a mesma infraestrutura de `research.discover` (mesmo parser de RSS, mesma persistência em `historical_findings`, mesmo `research.recordFinding` para promover um achado a evidência).

No painel do caso, o cartão "Agente de apoio" — antes um placeholder estático — ganhou o botão "Cruzar fontes oficiais": um clique já traz candidatos com título, veículo e link, para o editor abrir, conferir e registrar. Como antes, a descoberta nunca é evidência por si só e o agente não tem acesso a status, veredito, revisão ou publicação.

## Atualização — prova original × distorção, fontes oficiais e fluxo completo

Esta etapa traz para o código a visão descrita em `FLOW.md`: em vez de parar num rótulo binário,
o caso passa a carregar **os dois lados** de uma fala — o instante original e a versão que circulou.

**Momentos indexados** (`case_source_moments`, migração `0007_source_moments.sql`). Cada momento
tem papel (`original`, `viral_distorcido`, `contextual`), tipo de mídia, URL, origem, o instante em
segundos (início e fim), o trecho literal dito naquele ponto e — na versão viral — a descrição
obrigatória da distorção. O backend recusa uma versão viral sem essa descrição e só aceita vincular
a viral a um momento que pertença ao mesmo caso e esteja marcado como prova original. Em vídeos do
YouTube o link publicado já abre no instante indexado. Cada momento pode ser espelhado na trilha de
evidências, com a relação sugerida conforme o papel (`contradiz` para a viral, `contextualiza` para
a original). Na página pública, as duas colunas aparecem lado a lado para o leitor conferir sozinho.

**Fontes oficiais sem credencial** (`server/_core/officialSources.ts`). Conector do SGS do Banco
Central com catálogo de séries usadas em checagem econômica (IPCA, IPCA-15, IPCA 12 meses, Selic,
CDI, dólar, euro). `official.suggest` deriva a série da própria alegação; `official.crossCheckBcb`
consulta a série e registra evidência candidata já datada pelo último ponto da série.

**Checagens já publicadas** (`server/_core/googleFactCheck.ts`). Busca no Google Fact Check Tools
(ClaimReview) por checagens de outros veículos. O rótulo do veículo é traduzido em relação editorial
por uma heurística deliberadamente cautelosa: rótulos qualificados ("parcialmente verdadeiro",
"mostly false") viram `contextualiza`, nunca apoio ou contradição plenos — a classificação de outro
veículo não é, sozinha, o veredito deste caso. Sem `GOOGLE_FACTCHECK_API_KEY` a etapa é reportada
como "pulada" e o resto do fluxo continua.

**Rodar fluxo completo** (`research.prepareCasePipeline`). Dispara em paralelo as três fontes
acima e devolve um relatório por etapa (`ok` / `pulado` / `erro`), para o editor ver exatamente o
que rodou e o que faltou configurar. Nenhuma etapa decide status ou veredito.

**Laudo "fulano disse isso?"** (`analysis.quoteLaudo`). Avalia atribuição da fala e uso fora de
contexto, considerando os momentos indexados e as evidências já registradas. Produz material
estruturado para o editor — sem campo de veredito.

### Fora deste deploy

A busca de fala original no YouTube e a transcrição por Whisper, previstas em `FLOW.md`, dependiam
do proxy interno da plataforma Manus (`BUILT_IN_FORGE_API_URL`), que não existe nesta instalação
standalone. Reativá-las exigiria um provedor próprio de busca de vídeo e de transcrição.
