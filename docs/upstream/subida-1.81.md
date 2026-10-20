# Subida do upstream 1.81 (etapa 3 de 4)

`git merge --no-ff v1.81.0` sobre a `dev` (que já tem a v1.77.0, as etapas 1 e 2 e as
correções da #214), na branch `chore/subida-upstream-1.81`. Mesmo método das etapas
anteriores (`subida-1.73.md`, `subida-1.77.md`): merge e não rebase, alvo na TAG, e
quando os dois lados mexem na mesma coisa a correção do upstream entra DENTRO da nossa
versão.

- Entre v1.77.0 e v1.81.0: 1.307 commits, 1.422 arquivos, 40 migrations novas (0511, 0583..0673).
- Conflito de conteúdo em **67 arquivos**. Cinco páginas com molde (`ai/credentials`,
  `settings/conversoes`, `settings/marca`, `settings/tenant`, `settings/tenant/pipelines`)
  só divergiam em indentação: resolvidas pelo merge com `-Xignore-space-change` numa
  worktree descartável e conferidas linha a linha contra o nosso lado.

## Regras que decidiram

As mesmas das etapas 1 e 2: nosso trabalho tem prioridade quando colide (design
system/pele/molde de página, `components/ui`, app de celular, Funil #200/#201/#206/#207,
conversão por etapa #208/9054, marca só do platform admin #211, poda do event_log #214,
provider verdash/FZAP, `es`, faixa 9xxx); do upstream entra tudo o que não colide; mesma
função alterada pelos dois = integra. **Troca de funil move o MESMO card, nunca clona**:
o upstream trouxe nesta faixa a "continuação" do ganho (#2769), que CLONA o negócio
ganho no funil de pós-venda. Ficou de fora (ver abaixo).

## Banco

### Colisão de timestamp

Nenhuma. As 40 migrations novas não repetem timestamp nem número de nenhuma nossa; nada
foi renumerado. `scripts/checar-colisao-de-migration.sh origin/dev` limpo.

### Objetos redefinidos pelos dois lados → migration `9058`

| objeto | upstream | fork | o que se perdia |
|---|---|---|---|
| `agent_inbox_items_kind_check` | 0601 (`cobranca`), 0614 (`email_de_login_trocado`) | 9043/9055/9056 | cadeia: os dois kinds novos (9056 roda depois) / produção: `task_due` e `canal_pausado` |
| `webhook_events_log_provider_check` | 0601 (`stripe`, `asaas`) | 9002/9004/9023 | cadeia: nada (9023 é anterior) / produção: `verdash` e `instagram` |
| `emit_event` | 0594, 0670 (e a 0551/0581 da etapa 2) | 9054 | **cadeia e baseline já estavam sem a 0551/0581** (o desfecho do negócio reservado ao gatilho, `contact.birthday`): a 9054 reescreveu a função sobre uma versão antiga. Agora também `contact.phone_added` e a revogação do turno (0594/0670) |
| `fn_lgpd_cascade_redact_contact` | 0620 (a comanda sai da cascata) | 9023 | a anonimização deixava o `@` e o id do Instagram e a TRANSCRIÇÃO da ligação |
| `fn_tags_normalizar`, `fn_vocabulario_de_tags_operar` | 0673 (#2895) | 9038 | a guarda (suporte/MFA), as travas e a reserva de `cliente`. O conserto da 0673 (excluir uma etiqueta não apaga as outras) já estava na 9038, letra a letra |
| `fn_financeiro_provisionar` + as `_write` do financeiro | 0619 (e 0533 da etapa 1) | 9007 | **o viewer apagava conta, comanda e lançamento** (ver abaixo) |

`20261020000000_9058_integracao_da_subida_1_81.sql` roda por último e deixa a versão
INTEGRADA. `comando_da_conversa` (0645 × 9013) não entra: a 0645 resolve o mesmo
problema de desempenho da 9013 de um jeito melhor (o bit na própria conversa), e já é a
última definição na cadeia e no baseline.

#### Financeiro: o papel no USING (achado desta subida)

A 0533 (etapa 1) virou as nove policies dinâmicas do financeiro no par `_read`/`_write`,
e a provisionadora da 0619 faz o mesmo nas cinco da comanda. A `_write` é `for all` com
`using (vínculo or _full)` e o papel só no `with check`. Em `for all`, DELETE consulta
APENAS o `using`, e as policies permissivas somam por OR com as da 9007: a `_write`
sozinha deixava qualquer membro da organização (viewer incluído) apagar a linha, o
defeito que a 9007 tinha fechado, e o próprio comentário da 9007 avisa ("a antiga
sozinha já autoriza o delete"). A 9058 põe o papel no USING da `_write` das nove tabelas,
troca a pura por `fn_is_platform_admin_full()` nas três de escrita da 9007 e redefine a
provisionadora com o mesmo USING, para o reaplicar do módulo não reabrir. Prova:
`tests/invariants/financeiro-viewer-nao-apaga-9058.test.ts` (viewer e agent apagam 0 em
`financial_accounts`, manager apaga 1; catálogo das nove).

### baseline.sql

- Só dois conflitos: a lista de `webhook_events_log_provider_check` (a união) e o fim do
  arquivo (apêndices novos do upstream 0600..0659 ANTES do apêndice da Tektus, que segue
  no FIM). O resto entrou pelo merge, com os blocos 0600..0673 antes dos nossos
  9005..9057 e da VARREDURA anon.
- Bloco "SUBIDA 1.81 (migration 9058)" com as funções, ANTES da VARREDURA anon
  (cria função).
- Bloco do financeiro (as policies da 9058) no apêndice da Tektus, depois da 9007 e antes
  do laço da 9031.
- `kind_check` e `provider_check` continuam definidos uma vez só (a lista do baseline já
  é a união; a 9058 a repete).

### Índices para criar `concurrently` ANTES do deploy

As migrations do upstream criam sem `concurrently`. Os que pesam em produção:

- `ai_chunks_content_pt_gin` (0617, GIN textual em `ai_chunks`);
- `uq_contacts_org_id` (0611, único) e `idx_contacts_org_ai_opt_out` (0624) em `contacts`;
- `conversations_contact_id_idx` (0645) em `conversations`;
- únicos parciais em `agent_inbox_items`: `agent_inbox_budget_aberto_unico`,
  `agent_inbox_budget_do_plano_aberto_unico` (0583), `agent_inbox_reminder_sender_open_unique` (0625);
- `uniq_webhook_events_log_cobranca` (0601, único parcial);
- `crm_tasks_demanda_idx` (0659).

Os de `sales`, `sale_items`, `commission_rules`, `commissions`, `loyalty_ledger`,
`cobranca_*` e `channel_schedules` são de tabela nova ou do módulo (pequenas).

Atenção também à 0645: cria `conversations.contato_trava_humano` e faz o backfill com
UPDATE em `conversations` inteira (lock de linha em toda a tabela durante o update).

Depois: `select indexrelid::regclass from pg_index where not indisvalid;` vazio.

## Decisão por arquivo em conflito

| arquivo | decisão | detalhe |
|---|---|---|
| `CHANGELOG.md` | os dois | nosso [Não lançado] em cima, 1.78–1.81 do upstream abaixo |
| `package.json` | integrado | `test:shell` do upstream + nosso `upstream-sync-intersecao`; `resend` do upstream; `sharp` segue dependência direta (miniatura 9033) com a versão do override do upstream. `pnpm-lock.yaml` do upstream, refeito pelo `pnpm install` (o patch nosso do `zod`) |
| `app/api/v1/pipelines/[id]/board/route.ts` | integrado | o próximo passo (#200) e o selo das tarefas (EPIC-04) na mesma cadeia |
| `components/kanban/KanbanCard.tsx` | integrado | o `TarefasNoCard` do upstream ao lado do nosso `ResponsavelDoCard`, no rodapé do card |
| `components/kanban/BulkActionBar.tsx` (+ teste) | os dois | "Marcar como perdido…" em lote (#2484) com o nosso "Mover para…" só nas etapas abertas |
| `components/kanban/LoseLeadDialog.tsx` | integrado | modo LOTE (`onConfirm`/`submitting`) do upstream com o nosso motivo opcional (9044), `aoConcluir` e o `adiar` (Desfazer); o `FormularioDePerda` recebe os dois modos |
| `app/app/pipelines/[id]/_client.tsx` | integrado | a visão Calendário (#2770) virou a terceira opção do nosso seletor de vista (`VistaDoFunil`), com o MESMO recorte filtrado; o cabeçalho e o seletor de funil seguem os nossos |
| `lib/automation/actions/create-or-move-lead.ts` | nosso | **fora**: a continuação do ganho (#2769) que clona o card. O nosso ramo move o MESMO card (9053) em qualquer gatilho |
| `app/app/webhooks/_components/ActivityTab.tsx` | nosso | a frase `continuacao_exige_outro_funil` não tem emissor no fork |
| `app/api/v1/tasks/route.ts`, `tasks/[id]/route.ts` | os dois | `recusaDeVinculoDaTarefa` e `prazoNoPassado` nossos + `conferirDemanda` e `conferirResponsavel` do upstream |
| `hooks/tasks/useTasks.ts` | integrado | invalida conversas (nosso) e o quadro (upstream) |
| `components/inbox/painel/AbaResumo.tsx` (fora de conflito) | ajustado | `TarefasDaDemanda` (#2818/#2842) entra depois das Demandas; `podeEditar` é o nosso `!leitura` |
| `components/inbox/CRMSidePanel.tsx` | nosso | o painel em abas; o bloco de tarefas foi para a aba Resumo (acima) |
| `components/inbox/Composer.tsx` (+ `composer/*`) | integrado | o curinga literal (#2744: aviso persistente, envio barrado só no botão e no Enter, toast no modelo), o `display_name` como fallback, a citação de contato pelo nome e o fim do envio removendo só as menções daquela nota (#2463) dentro do nosso composer em peças |
| `components/inbox/InboxLayout.tsx` | nosso (+ do upstream) | o botão "Iniciar conversa" (#2813) no topo da lista; **fora**: as divisórias do upstream (#2579), que o fork já tem (`PegadorDeColuna`) |
| `components/inbox/InboxFilters.tsx` | nosso | as abas e o seletor de etiqueta do DS; **fora**: a nova ordem das abas (#2498), a busca dentro do seletor de etiqueta e a faixa que quebra (#2745) |
| `components/inbox/ChatThread.tsx` | nosso (+ do upstream) | o conserto da ancoragem com esqueleto (#2515) foi para `fio/useAncoragemNoFim.ts` |
| `components/inbox/MessageBubble.tsx` (+ teste) | nosso (+ do upstream) | a citação de contato pelo nome (vCard) foi para `bolha/CitacaoNaBolha.tsx`; o teste novo entrou |
| `components/inbox/media/{MediaRenderer,DocumentCard}.tsx` | nosso (+ do upstream) | o nome original (`media_filename`, #2613) entra antes do nosso `filename`; o cartão do DS fica (a sigla no ícone). `tests/unit/inbox-documento-nome-original.test.tsx` mede o título |
| `components/inbox/ConversationHeader.tsx` (+ teste) | nosso | **fora**: a barra que rola no celular; o app de celular é o nosso |
| `components/inbox/ConversationTagsEditor.tsx` | integrado | a cor no momento da criação (#2718) com o nosso delta (9045) |
| `components/ui/dropdown-menu.tsx` | integrado | o submenu em portal com `collisionPadding` e rolagem (#2702) com a pele DS e a folha do celular |
| `components/shell/Sidebar.tsx` | nosso | **fora**: o controle de recolher no alto (#2722); a barra do DS não tem o controle |
| `lib/notifications/push.handler.ts`, `web_push.ts` | integrado | o push só a quem vê a conversa (0612) e aos destinatários (`destinatariosDoInbound`) com o nosso filtro de quem silenciou (9042), que passou para dentro de `enviarPushAQuemVeAConversa` (o `enviarPushDaOrg` recebe a lista já filtrada) |
| `app/api/v1/metrics/lost/route.ts` | integrado | a paginação do upstream lendo `crm_desfechos_de_negocio` (9053); desempate por `(lead_id, origem)` |
| `app/api/v1/cron/data-retention/route.ts` | integrado | a nossa poda do bus (9021/9057) dentro do `executarDreno` do upstream |
| `lib/branding/css.ts` | integrado | a segunda semente do escuro (#2482) vale quando escolhida; sem ela, o escuro segue a rampa do produto |
| `lib/channels/arquivo-de-webhook.ts` | nosso | `asaas-access-token` entrou em `cabecalhos-para-arquivo.ts` |
| `lib/conversoes/envio.handler.ts`, `lib/leads/*`, `lib/instalacao/modulos.ts`, `lib/ai/*`, `lib/navigation/catalogo.ts`, `lib/i18n/dicionario.ts` | os dois | importações e entradas dos dois lados; chaves repetidas do dicionário uma vez só |
| `lib/waha/ingest.ts` | os dois | imports dos dois (o `semAssinatura` segue fora) |
| páginas com molde (`settings/billing`, `tenant/agenda`, `tenant/financeiro`, `webhooks`, `settings/tags`, `team`, `tasks`) | integrado | nosso `Pagina`/`CabecalhoDaPagina`; do upstream: painel da assinatura, comissão por módulo, aba inicial dos webhooks, nome da cor da etiqueta, rótulo do papel |
| `components/contacts/CustomFieldsEditor.tsx` | integrado | campos condicionais (#2728, `camposVisiveis`) com a nossa coluna única |
| `tests/invariants/*` | os dois | entradas dos dois lados |

Fora de conflito, mas ajustado: `app/app/webhooks/automacoes/[id]/_components/visual.ts`
(o designer novo do upstream não conhecia a nossa ação `create_lead_in_pipeline`),
`lib/design-system/amostras/painel.ts` (`demanda_id` na tarefa de amostra),
`lib/tarefas/aviso-de-tarefa.test.ts` (o tsconfig do upstream ficou mais estrito).

## O que do upstream ficou de fora, e por quê

1. **Continuação do ganho (#2769)**: cria um card NOVO no pós-venda clonando o ganho. A
   regra do fork é mover o MESMO card; o ganho já segue para o pós-venda sem duplicar
   (9053).
2. **Divisórias arrastáveis do Inbox (#2579)**: o fork já tem as colunas reguláveis.
3. **Ordem nova das abas, busca no seletor de etiqueta e faixa que quebra (#2498, #2745)**:
   a faixa e o seletor são os do DS. A busca no seletor fica como pendência.
4. **Controle de recolher no alto da barra (#2722)** e **barra de ações que rola no
   celular**: a barra lateral e o app de celular são os nossos.

## Pontos para o @Cassio_SecRev

- A 9058 corrige dois defeitos que já estavam na `dev`, das etapas anteriores: o
  `emit_event` sem as reservas da 0551/0581 (desde a 9054) e a `_write` do financeiro
  sem papel no USING (desde a 0533).
- Push: o filtro de quem silenciou (9042) agora roda dentro de
  `enviarPushAQuemVeAConversa`. Antes ele rodava sobre o client falso de
  `inscricoesJaFiltradas` e não filtraria ninguém.

## Validação

Ver a descrição do PR.
