# Integração de agentes de pesquisa

O VerificaFonte separa **pesquisa**, **evidência** e **decisão editorial**. Um serviço externo autorizado pode atuar como agente de navegação, mas nunca recebe uma operação para escolher o status final ou publicar um caso.

## Fluxo recomendado

| Etapa | Responsável | Resultado persistido |
|---|---|---|
| 1. Criar a alegação | Editor | `cases.create` |
| 2. Criar uma tarefa | Editor ou orquestrador | `research.create` |
| 3. Navegar em fontes autorizadas | Agente externo | Retorno com URL, origem, data e contexto |
| 4. Registrar o achado | Serviço autorizado ou editor | `research.recordFinding` / `evidences.add` |
| 5. Organizar o material | Modelo de linguagem | Briefing de apoio em `analysis.generate` |
| 6. Decidir e publicar | Revisor humano | `reviews.submit` e `cases.updateWorkflow` |

## Regras de segurança e editoriais

As fontes devem ser registradas como endpoints HTTPS públicos ou por um conector autorizado. A ingestão controlada rejeita endpoints locais e redes privadas, limita o tempo de resposta e reduz o retorno a um trecho textual para leitura editorial.

O retorno do agente deve conter, no mínimo, `caseId`, `title`, `url`, `sourceName`, `sourceType`, `relation` e `context`. Quando houver uma tarefa, inclua também `taskId`; o sistema identifica o retorno como tarefa de pesquisa no contexto da evidência.

Modelos de linguagem podem extrair alegações, resumir fontes e apontar divergências. Eles não escolhem `confirmed`, `divergent`, `insufficient` ou `in_review`, e não têm permissão para chamar o fluxo de publicação.

## Operação do provedor

O projeto mantém o contrato dentro da API tRPC protegida pela sessão editorial. A conexão com um provedor de navegação real deve ser adicionada somente depois de definir credencial, limites de acesso, política de retenção e mecanismo de entrega do retorno. Em produção, prefira callbacks autenticados e idempotentes; no MVP, o editor pode operar a fila e registrar os achados pela bancada.

## Descoberta histórica de notícias

A rota protegida `research.discover` cria uma tarefa para o papel `navegador` e consulta o RSS público do Google Notícias com a alegação, idioma, data inicial e data final. O período é limitado a 366 dias por consulta, e o retorno é limitado a 25 candidatos.

Cada candidato devolve título, URL de descoberta, URL final quando o redirecionamento pode ser resolvido, veículo, data publicada, idioma, país, provedor de descoberta e data de consulta. A URL é normalizada para remover fragmentos e parâmetros comuns de rastreamento. Os candidatos são apenas pistas: a interface exige abertura e conferência editorial antes de registrar uma evidência.

O agente não acessa `status`, `workflowStatus`, revisão ou publicação. Quando um editor registra um candidato como evidência, o sistema salva o contexto da descoberta e preserva a data de consulta. Conteúdo encontrado em uma página ou instrução de um site é tratado como dado, nunca como instrução para o agente.

O mecanismo foi validado com uma consulta real por `IPCA` no intervalo de 01/08/2026 a 29/08/2026, retornando candidatos de notícias. A consulta GDELT DOC 2.0 também foi investigada, mas não respondeu dentro do timeout do ambiente; por isso, o MVP usa RSS público como mecanismo principal de descoberta.
