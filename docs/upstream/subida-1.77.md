# Subida do upstream 1.77 (etapa 2 de 4)

`git merge --no-ff v1.77.0` sobre a `chore/subida-upstream-1.73` (etapa 1, PR #210), na
branch `chore/subida-upstream-1.77`. Mesmo método da etapa 1 (`subida-1.73.md`): merge e
não rebase, alvo na TAG, e quando os dois lados mexem na mesma coisa a correção do
upstream entra DENTRO da nossa versão.

- Entre v1.73.0 e v1.77.0: 830 commits, 910 arquivos, 22 migrations novas (0530, 0545..0599).
- Conflito de conteúdo em **73 arquivos**.

## Regras que decidiram

As mesmas da etapa 1: nosso trabalho tem prioridade quando colide (design system/pele,
`components/ui`, molde de página, app de celular, Funil #200/#201/#206/#207, conversão
por etapa #208/9054, provider verdash/FZAP, `es`, faixa 9xxx); do upstream entra tudo o
que não colide; mesma função alterada pelos dois = integra. **Troca de funil move o
MESMO card, nunca clona** — o upstream não reintroduziu clone novo nesta faixa; o teste
do clone (#2303) saiu (ver abaixo).

## Banco

### Colisão de timestamp

Nenhuma. As 22 migrations novas do upstream não repetem timestamp nem número de
nenhuma nossa; nada foi renumerado.

### Objetos redefinidos pelos dois lados → migration `9056`

| objeto | upstream | fork | o que se perdia |
|---|---|---|---|
| `agent_inbox_items_kind_check` | 0589 (`canal_pausado`) | 9043/9055 (`task_due`) | cadeia: `canal_pausado` (9055 roda depois) / produção: `task_due` (0589 roda depois) |
| `fn_attendant_metrics` | 0596 (#2514, recorte antes do lateral) | 9053 (desfechos da época) | cadeia: o #2514 / produção: os desfechos de quem trocou de funil |
| `fn_contagens_da_caixa` | (lista: 0545 canal desativado, 0563 pessoal) | 9029..9051 (uma consulta) | o badge contava conversa que a aba esconde |

`20261019220000_9056_integracao_da_subida_1_77.sql` roda por último e deixa a versão
INTEGRADA, gerada a partir dos trechos do `baseline.sql`. A contagem passa a excluir
`contacts.is_personal` e canal com `channel_sessions.metadata.disabled = true`, o mesmo
corte que o upstream pôs na lista (`app/api/v1/conversations/_handler.ts`).

Nenhuma migration nova do upstream redefine policy ou função que a 9028/9030/9055
endureceu (conferido pelos objetos criados no diff `v1.73.0..v1.77.0` do baseline:
policies novas só em `catalog_products` e `jev_router_decisions`).

### baseline.sql

- Montado a partir do NOSSO (HEAD) com o patch `v1.73.0 → v1.77.0` do upstream: 10 dos
  13 trechos entraram por contexto; os 3 que não entraram foram postos à mão.
- Blocos novos do upstream (0547..0599, 1.350 linhas) antes dos nossos 9005..9056 e
  antes da VARREDURA anon; apêndices novos do upstream (0558..0599) antes do apêndice
  da Tektus, que continua no FIM.
- `kind_check` (definido uma vez só): `task_due` e `canal_pausado` juntos.
- `fn_attendant_metrics` do bloco 9053: `git merge-file` com a versão da 0596 (limpo).
- `fn_contagens_da_caixa` do bloco 9051: o corte de pessoal e de canal desativado.

### Índices para criar `concurrently` ANTES do deploy

As migrations do upstream criam sem `concurrently` (a 0585 avisa que trava a escrita):

- 0585: `idx_send_ledger_contato_entregue`, `idx_llm_calls_job_id`,
  `idx_lead_checkpoints_job_id`, `idx_lead_state_transitions_job_id`,
  `event_log_processing_por_tipo_idx`;
- 0587: os sete `*_expurgo_*` (`llm_calls`, `metrics`, `skill_activations`,
  `ai_router_decisions`, `pacing_ledger`, `outbound_copies`, `lead_checkpoints`);
- 0563: `idx_contacts_org_personal`;
- únicos: `uniq_comanda_do_ganho_por_negocio` (0582), `agent_inbox_canal_pausado_aberto_unico`
  (0589), `jev_router_decisions_org_message_idx` (0547).

Depois: `select indexrelid::regclass from pg_index where not indisvalid;` vazio.

## Decisão por arquivo em conflito

| arquivo | decisão | detalhe |
|---|---|---|
| `CHANGELOG.md` | os dois | nosso [Não lançado] em cima, 1.74–1.77 do upstream abaixo |
| `package.json` | integrado | `test:shell` do upstream (`restore-falha-alto`) + nosso `upstream-sync-intersecao`; `pnpm-lock.yaml` do upstream, refeito pelo `pnpm install` |
| `lib/schemas/webhooks.ts` | integrado | `acoesFixas` do upstream (domínio da `ai_decide`, #1970) com o nosso `create_or_move_lead` + `create_lead_in_pipeline` e `OPCOES_DA_TROCA` dentro |
| `lib/campanhas/renderizador.ts` (+ teste) | integrado | campos `{{lead.x}}`/`{{contato.x}}` e a blindagem do upstream (#2404) com o nosso `{{var\|fallback}}`, o guard de vazio e as variações (9034). `resolverSaudacao` (a passada final do envio) tira a blindagem |
| `lib/campanhas/preparacao.ts`, `acoes.ts`, `tipos.ts` | integrado | spintax + variação por contato com os campos personalizados; a consulta lê as colunas de campo olhando TODAS as variantes; motivos `negocio_ja_fechado` (9040) e `contato_pessoal` (0563) |
| `lib/campanhas/entrada-por-etapa*.ts` (fora de conflito) | ajustado | a entrada contínua (9039) lê `is_personal` e exclui o pessoal (contrato novo de `ContatoParaDecidir`) |
| `lib/conversoes/envio.handler.ts` | integrado | evento de etapa pelo canal (upstream) com o nosso `eventoId` estável por ENTRADA (9054) |
| `lib/agent-engine/guardrails/disclosure/template.ts` | integrado | `exists` do upstream nos dois caminhos, com o nosso recorte `desde` da cadência |
| `lib/auth/require-role.ts`, `lib/api/errors.ts`, `lib/instalacao/modulos.ts` | os dois | `org_divergente` (#2335) e `login_codex` do upstream + `fonte_sem_funil` e `prospeccao` nossos |
| `lib/waha/ingest.ts`, `lib/channels/pos-entrada.ts`, `lib/leads/nascimento-do-lead.ts` | nosso (+ do upstream) | imports dos dois; o `origemDoNegocioPeloCanal` segue fora (etapa 1); o nascimento lê `is_personal` e `instagram_username` |
| `lib/leads/transfere-para-o-funil.ts` | nosso | só as colunas; o #2303 do upstream (recusa ANTES do clone) não se aplica: o mover não fecha a origem. `tests/unit/transferencia-de-funil-recusa-antes-do-clone.test.ts` saiu |
| `app/api/v1/cron/data-retention/route.ts` (+ teste) | os dois | nossa poda do bus (9021) + mídia (0557) e as quatro da IA (0587) |
| `app/api/v1/conversations/counts/route.ts` | nosso | a RPC única (9029); o corte de pessoal e de canal desativado foi para a função (9056) |
| `app/api/v1/{contacts,conversations,messages}/_handler.ts`, `pipelines/[id]/board` | integrado | `is_personal` nos SELECTs (spec 21) junto das nossas colunas (observações 9041, Instagram) |
| `hooks/inbox/use{Conversations,Messages}Realtime.ts` | nosso | o cache por evento (correção no lugar) já junta a rajada; o `agendarRecargaDasConversas` do upstream ficou sem uso |
| `workers/media-derive-worker.ts` | do upstream | o custo das chamadas de mídia em `llm_calls`; o marcador segue em `derivable.ts` |
| `lib/i18n/dicionario.ts` | os dois | união; chaves repetidas ficaram uma vez (`Mais`, `Remover passo`) |
| `app/globals.css` | nosso + do upstream | todos os tokens nossos (Verdash, neutros, sombras, avatar, DS v2, `mb-*`); do upstream entram `duration-spring` e o bloco de movimento dos sobrepostos (`ds-*`) |
| `components/ui/*` (button, dialog, alert-dialog, popover, select, tabs, dropdown, input, textarea) | nosso | pele DS; o 44px do upstream já vem pelo nosso `h-11 lg:h-9` e o 16px pelo `mb:text-[16px]` |
| `components/ui/sheet.tsx` | integrado | a direita mantém `animate-slide-in` (paridade com o protótipo); topo, baixo e esquerda usam a `ds-gaveta` do upstream no lugar das classes mortas |
| `components/voice/ActiveCallPanel.tsx` | integrado | nosso deslocamento da casca + `ds-surge` |
| `app/layout.tsx` | nosso (+ do upstream) | fontes Atkinson Next e o aviso no topo (nosso); `width/initialScale` do upstream |
| `app/app/_components/AppShell.tsx` | nosso | **fora**: a `BarraInferior` do upstream (1.76): o app de celular é a nossa `CascaDoCelular`. Entra o `min-h-dvh` |
| `components/shell/Sidebar.tsx` | nosso | `h-dvh` e `duration-base` do upstream |
| `components/shell/CommandPalette.tsx` | nosso | a busca geral do DS (contatos/conversas/leads); o conserto de posição do upstream era do `ds-modal`, que a nossa paleta não usa |
| `components/inbox/Composer.tsx` | integrado | menção de atendente em nota (#2372, #2463) do upstream dentro do nosso composer (lista, setas/Enter/Tab/Esc, poda, retry com as menções) |
| `components/inbox/ConversationHeader.tsx` (+ `cabecalho/*`) | integrado | nosso cabeçalho em peças; do upstream: nome do canal (#2383) em `IdentidadeDaConversa`, `VideoCallButton` (#2440) ao lado da ligação, Marcar/Desmarcar pessoal no "Mais" (`MaisAcoes`) com a confirmação |
| `components/inbox/ConversationListItem.tsx` | nosso | o `rotuloDoCanalDaConversa` (#2383) entrou no nosso rótulo |
| `components/inbox/InboxLayout.tsx` | nosso | a janela/bloqueio moram em `PainelDaConversa`, que passou a usar `motivo-do-envio-bloqueado.ts` do upstream |
| `components/inbox/MessageBubble.tsx` | nosso | o aviso de mídia apagada pela retenção (0557) foi para `bolha/CorpoDaBolha.tsx` |
| `components/inbox/NoteCard.tsx` | nosso | a menção realçada (`partesDoCorpo`) no nosso corpo da nota |
| `components/kanban/KanbanBoard.tsx` | os dois | `proximoNaEtapaInteira` (#2545) + nossa ordem do funil |
| `app/app/pipelines/[id]/_client.tsx` | integrado | altura pelo contrato do rodapé (upstream) com o nosso `gap-3` |
| páginas com molde (`settings/tenant`, `ai/credentials`, `ai/usage`, `ai/runs`, `settings/conversoes`, `products`, `contacts`, `campaigns/new`, `metrics`, `team`, `settings/tags`, conexões) | integrado | nosso `Pagina`/`CabecalhoDaPagina`; do upstream: retenção de mídia ligada, painel do login Codex, texto novo do Uso de IA, aba Roteamento, regras de etapa pelo canal, paginação de produtos, filtro Pessoais, aviso de recorte truncado, editor de jornada, cor da etiqueta |
| testes (`branding`, `lead-so-liga…`, `motivo-de-parada…`, `retencao-poda…`, `rodape-ocupado-*`) | os dois / nosso | entradas dos dois lados; o contrato do rodapé segue o nosso (`--mb-casca-baixo`) |

## O que do upstream ficou de fora, e por quê

1. **Barra de abas do celular (`components/shell/BarraInferior.tsx`)** — o app de celular
   é o nosso (`CascaDoCelular`). O arquivo fica, sem uso no `AppShell`.
2. **Classes `ds-*` nos primitivos do DS** — a pele do protótipo manda; só a gaveta e o
   painel de chamada usam o movimento novo.
3. **Paleta de navegação por categorias** — a nossa busca geral do DS ficou.
4. **Teste do clone com recusa antes da primeira escrita (#2303)** — o fork não clona.

## Pontos para o @Cassio_SecRev

- A nossa poda do `event_log` (9021) segue de pé. O upstream diz, no cron de retenção,
  que `event_log` é livro-razão de idempotência dos gatilhos de tempo e que podá-lo
  "reenviaria WhatsApp". A 9021 preserva `pending`/`processing` e tem piso de 90 dias;
  vale conferir se algum gatilho de tempo deduplica por `event_log` além de 90 dias.
- A entrada contínua (9039) não lê campo personalizado: `{{lead.x}}` numa campanha de
  entrada por etapa vira `variavel_ausente` (falha fechada).

## Validação

Ver a descrição do PR.
