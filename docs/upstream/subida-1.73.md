# Subida do upstream 1.73 (etapa 1 de 4)

`git merge --no-ff v1.73.0` sobre a `dev` (que já continha a v1.69.0), na branch
`chore/subida-upstream-1.73`. Método da subida 1.41 (PR #2): merge e não rebase, alvo
na TAG, e quando os dois lados mexem na mesma coisa a correção do upstream entra
DENTRO da nossa versão.

- Entre v1.69.0 e v1.73.0: 1.053 commits, 1.052 arquivos, 29 migrations novas (0501..0543).
- Conflito de conteúdo em **72 arquivos**.

## Regras que decidiram

1. Nosso trabalho tem prioridade quando colide: design system do protótipo Inbox v2
   (`components/ui`, pele, tokens, `components/pagina`), app de celular, Funil (#200,
   #201, #206/#207), conversão por etapa (#208, 9054), provider verdash/FZAP, `es`,
   migrations 9xxx.
2. **Troca de funil move o MESMO card, nunca clona.** O upstream reintroduziu o clone
   em dois lugares (automação `lead.tag_added` e destino de funil da intenção do
   roteador, #2155). Os dois ficaram com o nosso `moverNegocioDeFunil`.
3. Do upstream entra tudo o que não colide; colidindo na mesma função, integra.

## Banco

### Colisão de timestamp (resolvida antes de commitar)

Quatro migrations nossas tinham o MESMO timestamp de migrations novas do upstream.
Renumeradas as nossas para o próximo segundo livre (o +1 de `20261004090000` já era
a 0534 do upstream):

| antes | depois | colidia com |
|---|---|---|
| `20261004090000_9029` | `20261004090002_9029` | `0533_support_readonly_nao_escreve_fatia_2` |
| `20261004120000_9030` | `20261004120001_9030` | `0537_ai_budgets_sem_truncate...` |
| `20261004180000_9032` | `20261004180001_9032` | `0539_dedupe_dos_avisos_other_por_titulo` |
| `20261005090000_9034` | `20261005090001_9034` | `0543_teto_do_nome_de_sessao_waha_no_banco` |

### Objetos redefinidos pelos dois lados → migration `9055`

As 05xx do upstream (30/09 a 05/10) e as nossas 9023..9054 (01/10 a 19/10) se
intercalam no tempo. Na cadeia nova ganha quem tem timestamp maior (quase sempre o
fork); em produção, que já aplicou as nossas, as do upstream entram depois e ganham.
Nos dois sentidos um lado apagava o outro, calado:

| objeto | upstream | fork | o que se perdia |
|---|---|---|---|
| `agent_inbox_items_kind_check` | 0501 | 9043 | `org_reativada` (cadeia) / `task_due` (produção) |
| `fn_validate_lost_reason_required` | 0513 | 9044 | `opted_out_of_messages` / motivo opcional por funil |
| `fn_solicitar_reenvio_conversao` | 0524 | 9054 | reenvio `MetaEtapa:` / compra por etapa ligada |
| RLS `contacts` | 0508 | 9030 | **`tenant_isolation_contacts_write` (for all, só tenancy) devolveria a viewer a escrita de contato** |
| RLS `organizations` | 0508 | 9028 | `for all` de escrita de volta |
| RLS `channel_sessions`, `crm_pipelines` | 0529/0533 | 9028 | `for all` de escrita de volta |
| RLS `conversation_notes` | 0509 | 9028 | editar/apagar só do autor ou manager+ |

`20261019210000_9055_integracao_da_subida_1_73.sql` roda por último e deixa a versão
INTEGRADA, gerada a partir dos trechos do `baseline.sql` (os dois não divergem por
construção). A escrita de platform admin nas tabelas da 9028/9030 passou para
`fn_is_platform_admin_full()` (intenção da 0508: `support_readonly` lê, não escreve);
a leitura segue com `fn_is_platform_admin()`. A 9043 também ganhou `org_reativada` na
lista (a cerca `migrations-nao-encolhem-vocabulario` exige; em produção quem cobre é a 9055).

### baseline.sql

- Blocos novos do upstream antes da VARREDURA anon; nossos 9005..9054 logo depois
  deles e ainda antes da VARREDURA (todos criam função); apêndice da Tektus continua
  no FIM, depois dos apêndices novos do upstream (0504..0542).
- Blocos antigos que o upstream editou e que nós tínhamos movido para os blocos da
  9028/9030 (`orgs_write_platform_admin`, `tenant_isolation_contacts_all`,
  `crm_pipelines_*`, `channel_sessions_*`, `conversation_notes_write`): fica o
  ponteiro nosso; a mudança do upstream (`_full`, autor-ou-manager) foi aplicada nos
  blocos 9028/9030.
- Bloco da 0508: as partes de `contacts` e `organizations` foram neutralizadas com
  ponteiro para 9028/9030 (senão cada update recriaria o par `read/write` e a `for all`).
- Bloco 0266 (motivo de perda): `opted_out_of_messages` dentro da nossa versão (9044).
- Bloco 9054: o reenvio aceita `MetaEtapa:`.
- `webhook_events_log`: saiu o GRANT a `anon` do snapshot (9035/9036 revogavam no fim;
  a cerca `baseline-nao-constroi-o-que-derruba` do upstream pegou a janela).
- MANIFEST: upstream passou a exigir `-- manifest:` no cabeçalho do `.sql` e NÃO no
  `MANIFEST.md`. Saíram do MANIFEST as linhas de 9034, 9037, 9039, 9040, 9043, 9046
  (que já tinham cabeçalho) e a 9055 nasceu só com cabeçalho.

## Decisão por arquivo em conflito

| arquivo | decisão | detalhe |
|---|---|---|
| `.github/actions/preparar-node/action.yml` | integrado | nosso `if: inputs.cache` + `actions/cache@v6` do upstream |
| `.github/workflows/ci.yml` | nosso | só comentário; o teto de 6 GB é o mesmo dos dois lados |
| `CHANGELOG.md` | os dois | nosso [Não lançado] em cima, seções 1.70–1.73 do upstream abaixo |
| `package.json` | integrado | `test:shell` do upstream (4 testes novos) + nosso `upstream-sync-intersecao` |
| `app/(public)/login/page.tsx` | integrado | `marca.nome` do upstream + nosso `text-title-lg` |
| `app/account-suspended/page.tsx` | integrado | HUB de suspensão do upstream inteiro + nosso `text-title-lg` |
| `app/api/v1/messages/_handler.ts` | integrado | SELECT com o `media_thumb_path` nosso (9033) e o `media_derived_status` do upstream |
| `app/api/v1/pipelines/[id]/agent-mapping/route.ts` (+ teste) | integrado | nossos `envia_conversao`/`evento_de_conversao` (9054) + `expected_duration_hours` do upstream (#1532) |
| `app/api/v1/pipelines/[id]/stages/[stageId]/route.ts` | integrado | nosso Zod da conversão por etapa + `expected_duration_hours` do upstream |
| `app/api/v1/prospecting/route.ts` | integrado | nossa trava de módulo por empresa (9026) antes do teto de escrita do token do upstream |
| `app/app/activities/page.tsx` | integrado | abas `Relatorios` (Por etiqueta) do upstream dentro da nossa `Pagina` |
| `app/app/ai/followups/enrollments/[id]/_components/DossieDoFollowup.tsx` | integrado | nosso cabeçalho/molde; textos do upstream ("Etapas executadas", `DESFECHOS`, "Falha ao processar a etapa") aplicados no nosso bloco |
| `app/app/ai/providers/_components/PainelDeProvedores.tsx` | integrado | `CartaoDeMapas` do upstream dentro da nossa `Pagina` |
| `app/app/companies/[id]/_client.tsx` | integrado | nosso `CabecalhoDaPagina`; botões Editar/Excluir e diálogos do upstream em `acoes` |
| `lib/conversoes/envio.handler.ts` (+ `registro-de-envio.ts`, `etapa-meta.handler.ts`) | integrado | nossa idempotência por ENTRADA (9054) + conversão Meta por etapa (0524) e valor lido da conversa do upstream. O evento de etapa da Meta pula a chave `envia_conversao` (a regra da Meta já é a decisão por etapa, com o próprio liga/desliga); a compra e a etapa do Google seguem na chave. `etapa-meta.handler.ts` ganhou o `ehEntradaPelaTroca`: troca de funil não envia conversão em nenhuma plataforma |
| `app/app/pipelines/[id]/_client.tsx` | integrado | nossa composição (`cabecalho/novo/barra`); `leads={data.leads}` do upstream (#1751, aviso de duplicado) no `NewLeadDialog` |
| `app/app/settings/atendimento/page.tsx` | integrado | nossa `SecaoDaPagina` + `AssinaturaForm` do upstream |
| `app/app/settings/conversoes/page.tsx` | integrado | nosso molde; do upstream: cartões `IdentidadeDaConversao` e `RegrasDeConversaoMeta`, rótulos de etapa no Histórico e nas pendências |
| `app/app/settings/security/page.tsx` | integrado | nosso molde; `exigenciaDeMfa` + `papelMinimo/diasDeCarencia` do upstream |
| `app/app/settings/tenant/pipelines/_stages.test.tsx` | os dois | nossos testes da chave de conversão + os do upstream (janela de esfriando, Escape, taxa por etapa) |
| `app/app/settings/tenant/proposals/_client.tsx` | integrado | nosso cabeçalho; o link de modelos só aparece com propostas ligadas (upstream #2270) |
| `app/app/webhooks/_components/ActivityTab.tsx` | os dois | motivos nossos (criar card em outro funil, lote) + `lead_already_transferred_in_event` e `acao_fecharia_laco` do upstream |
| `components/inbox/CRMSidePanel.tsx` | nosso | o painel virou abas em `components/inbox/painel/`; as correções do upstream foram para lá: `soChavesAlteradas` (#2132, só o campo mudado viaja) em `painel/EditorDoNegocio.tsx`, «há {tempo}» e "Responder à nova mensagem do cliente" em `painel/Demandas.tsx` |
| `components/inbox/ConversationList.tsx` | os dois | nosso rótulo de seção + aviso de Grupos do upstream (#2103) |
| `components/inbox/ConversationListItem.tsx` (+ teste) | nosso | **fora**: o rótulo acessível da bolinha de comando do upstream. A linha v2 não tem a bolinha (o comando aparece na meta da linha); os três testes da bolinha não se aplicam |
| `components/inbox/InboxLayout.tsx` | os dois | nossas portas por URL (`sem_passo`, `busca`, 9051) + `?tag=` do upstream |
| `components/inbox/MessageBubble.tsx`, `media/MediaRenderer.tsx` | integrado | nossa bolha (`bolha/CorpoDaBolha`, `ConfirmacoesDaBolha`) e nossa transcrição (#138). Do upstream: o aviso "Transcrevendo…" (#2133) portado para `CorpoDaBolha` (mesma régua: `DERIVACAO_TERMINADA`, 10 min, `created_at`) e o texto "continua na conversa do cliente". **Fora**: o bloco de transcrição dentro do `MediaRenderer` do upstream, que duplicaria a nossa |
| `components/kanban/ConversaSlot.tsx`, `KanbanCard.tsx` (+ teste) | integrado | nosso `enxuto` + `contactId/phone` do upstream (#1993, "Abrir conversa" sem thread) no card novo |
| `components/kanban/LeadDossier.tsx` (+ teste) | integrado | nosso dossiê com a conversa ao lado (`ConversaDoNegocio`); a ação "Abrir conversa" do upstream (#1993) entra quando o negócio não tem conversa |
| `components/ui/dialog.tsx` | nosso | já tinha o `max-h` + rolagem do upstream, na pele v2 |
| `hooks/pipelines/useAgentMapping.ts`, `useStages.ts` | os dois | nossos campos da 9054 + `expected_duration_hours` do upstream |
| `instrumentation-client.ts` | integrado | nossa amostragem (`AMOSTRAGEM_DE_REPLAY`, `taxaDeTraces`) + `integracoesDeReplay` do upstream (sem gravar página com credencial na URL) |
| `lib/agent-engine/agent/followup-turn.ts` | integrado | `try/catch` do upstream (turno descartado com org parada, 0501) + nosso `cadencia` |
| `lib/agent-engine/agent/inbound-turn.ts` | os dois | nossa guarda da condução + destino de funil da intenção do upstream (#2155) |
| `lib/agent-engine/db/repository.ts`, `lib/ai/agent-inbox-copy.ts`, `lib/ai/inbox-destino.ts` | os dois | aviso `task_due` nosso (9043) + `org_reativada` do upstream (0501) |
| `lib/agent-engine/edge/crm/drain.ts`, `lib/api/errors.ts`, `lib/audit/actions.ts` | os dois | imports/códigos/ações dos dois lados |
| `lib/auth/server.ts`, `lib/auth/types.ts` (+ `tests/unit/tenant-suspenso-nao-e-destino-padrao.test.ts`) | integrado | nosso `carregarUsuarioComMotivo` (rede ≠ sessão expirada) + `orgAtivaSemPortao`, `org_status`/`suspended_kind` e `platform_admin_scope` do upstream. A escolha da org ativa passou para a régua do upstream: sem cookie pula a suspensa (cobre o nosso incidente de 21/09); **com cookie numa suspensa, entra nela**, porque o hub `/account-suspended` (0501) é o caminho para pagar, LGPD e trocar de empresa. Nosso embed `situacao_da_empresa` e o campo `status` saíram (o upstream lê o mesmo dado no embed de `organizations`); o teste nosso foi ajustado à régua nova |
| `lib/auth/require-role.ts` (+ teste), `proxy.ts`, `tests/unit/auth-falha-alto.test.ts` | integrado | nosso motivo de auth + `orgAtivaSemPortao`/escopo do upstream; imports dos dois no `proxy` |
| `lib/automation/actions/create-or-move-lead.ts` | nosso | **regra de produto**: a troca de funil move o MESMO card (9053, `moverNegocioDeFunil`) em qualquer gatilho. O upstream (#2155) reintroduzia o clone (`transfereParaOFunil`, clona e encerra a origem) no ramo `lead.tag_added` e no ramo por contato; ficou de fora. O caso que o upstream queria destravar ("Recepção etiqueta, regra transfere") já é coberto pelo nosso mover |
| `lib/automation/engine.ts` | os dois | nosso pulo de ações que falam com o cliente em lote + o veto de laço do upstream (#1528) |
| `lib/agent-engine/agent/destino-da-intencao.ts` (+ teste), arquivo novo do upstream | integrado | o destino de funil da intenção do roteador (#2155) entra, mas **movendo** o card por `moverNegocioDeFunil` em vez de clonar; `cloneId` some do resultado. O aviso da Central para a recusa (#2297) continua igual. `lib/leads/transfere-para-o-funil.ts` fica no repo só pela constante de colunas |
| `lib/channels/pos-entrada.ts`, `lib/channels/zernio/ingest.ts` | nosso (+ imports do upstream) | os dois lados consertaram o mesmo defeito (negócio do Direct nascia "pelo WhatsApp"). Fica o nosso: `rede: ChannelBrand` OBRIGATÓRIO em todo ingest (`origemDaRede`), que não compila se um ingest novo esquecer a rede. **Fora**: o `canal?` opcional + `origemDoNegocioPeloCanal` do upstream (o arquivo `lib/channels/origem-do-negocio.ts` fica, sem uso no app). A 0531 do upstream (mesma regra no banco) entra |
| `lib/waha/ingest.ts` | nosso | o `ehEcoDeEnvioNosso` mora em `lib/channels/eco-de-envio-nosso.ts`; a correção do upstream (#2066, eco de envio ASSINADO não cala a IA) foi portada para lá |
| `lib/types/messaging.ts` | integrado | nossos campos de mídia assinada/miniatura + `media_derived_status` do upstream |
| `lib/kanban/filters.ts` | integrado | nossos atalhos (Meus, Sem passo, Parados, canais, período) + a moeda do limite de valor do upstream (#1531) |
| `lib/leads/activity-vocabulary.ts` | nosso | o texto da troca de funil fala do MESMO card (9053) |
| `lib/leads/nascimento-do-lead.ts` | nosso (+ import do upstream) | a origem chega sempre do ingest (`origemDaRede`); o `ORIGEM_PADRAO` do upstream não tem uso aqui |
| `lib/prospecting/store.ts` | integrado | nosso enriquecimento pelo site + `provedor.readResults` do upstream |
| `lib/followup/enviar-texto-fixo.test.ts`, `tests/setup/vitest.setup.ts` | os dois | testes/remendos dos dois lados |
| `workers/media-persist-worker.ts` (+ testes) | integrado | os dois fecharam a mesma corrida com a LGPD. Fica o nosso compare-and-set (`media_url` igual, sem arquivo, releitura antes de apagar do bucket, miniatura 9033) com a guarda do corpo redigido e o `media_derived_status` terminal (#2171) do upstream; a redação devolve `message_redacted`, como o teste do upstream espera (o fake do teste ganhou `.is` e relê a linha atual) |
| `workers/media-derive-worker.ts`, `lib/messaging/media/texto-derivado.ts` | integrado | `MARCADOR_NAO_LIDA` em UMA fonte (`derivable.ts`, a do upstream); o nosso módulo reexporta |
| `tests/unit/suspensao-nao-dispara-campanha.test.ts` | integrado | ver abaixo |
| `lib/leads/stage-operations.ts` | os dois | colunas da 9054 + `expected_duration_hours` (#1532) |
| `lib/i18n/dicionario.ts` | os dois | as duas listas de `es`; quatro chaves repetidas pela união (`Sem atendente`, `Transcrição`, `Abertas`, `Encerrada`) ficaram uma vez, com a tradução nossa |
| `supabase/baseline.sql` | integrado | ver "Banco" acima |

## Fora de conflito, mas ajustado (o merge limpo quebrava algo nosso ou do upstream)

- `lib/leads/transfere-para-o-funil.ts` (upstream, o clone): reduzido às colunas, com o
  cabeçalho da divergência; o conflito na próxima subida avisa.
- `lib/conversoes/etapa-meta.handler.ts` (upstream): pula a entrada pedida pela troca de funil.
- Handlers nossos (`lib/cadencia/*.handler.ts`, `lib/campanhas/entrada-por-etapa.handler.ts`)
  declaram `naOrgParada: "pula"` (contrato novo do `EventHandler`, 0501).
- `app/actions/admin/liberarModuloParaEmpresa.ts` (9026): escrita pelo
  `escritaDeAdminOuRecusa` (cerca `admin-escrita-exige-scope-full` do upstream).
- `app/app/settings/conversoes/_regrasMeta.tsx` e `security/_client.tsx` (upstream):
  `<select>` nativo virou `Escolha` (nossa cerca de controles nativos).
- Testes do upstream reapontados para onde o nosso código mora (painel em abas,
  bolha, eco, rede no lugar de canal, fixtures com `status` da org); a lista congelada
  de chave de runtime do `es` ganhou os 7 sítios do fork e perdeu 2 que o fork já pagou.

## O que do upstream ficou de fora, e por quê

1. **Clone na troca de funil** (`transfereParaOFunil` na automação e no roteador) —
   regra de produto: move o mesmo card.
2. **Rótulo acessível da bolinha de comando** na linha da conversa e seus 3 testes —
   a linha v2 não tem a bolinha.
3. **Transcrição dentro do `MediaRenderer`** — duplicaria a nossa (#138, na bolha). O
   aviso "Transcrevendo…" do upstream foi portado para a bolha; os testes do upstream
   rodam contra a bolha.
4. **`canal?` opcional + `origemDoNegocioPeloCanal`** no nascimento do negócio — o
   nosso `rede` obrigatório resolve o mesmo defeito e não compila se um ingest esquecer.
   A 0531 (backfill no banco) entra.
5. **Org ativa ignorando cookie em org suspensa** (nosso, 21/09) foi trocada pela régua
   do upstream: sem cookie pula a suspensa; com cookie entra nela, porque o hub
   `/account-suspended` (0501) é o caminho para pagar, LGPD e trocar de empresa.

## Validação

- `typecheck` (sem `*.tsbuildinfo`): limpo.
- Paridades (`paridade-*`): 4 arquivos, 19 testes verdes.
- Cercas e testes dos módulos em conflito (63 arquivos, 674 testes): verdes, exceto
  `e2e-cobertura-completa` (`celular-app-390.spec.ts` fora das listas, já na `dev`) e
  `telas-sem-dado-de-mentira` (estoura 15 s no Windows).
- O resto vermelho das cercas é a máquina de release/CI do upstream rodando em
  Windows (bash, git, docker, redis), como na subida 1.41.
- Invariantes na VPS30: ver a descrição do PR.
