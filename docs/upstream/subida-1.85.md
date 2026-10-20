# Subida do upstream 1.85 (etapa 4 de 4)

`git merge --no-ff v1.85.0` sobre a `dev` (que já tem a v1.81.0, as etapas 1 a 3 e a
#214), na branch `chore/subida-upstream-1.85`. Mesmo método das etapas anteriores
(`subida-1.73.md`, `subida-1.77.md`, `subida-1.81.md`): merge e não rebase, alvo na
TAG, e quando os dois lados mexem na mesma coisa a correção do upstream entra DENTRO
da nossa versão.

- Entre v1.81.0 e v1.85.0: 701 commits, 19 migrations novas (0618, 0643, 0663, 0665,
  0667, 0668, 0674..0683, 0685, 0686, 0688).
- Conflito de conteúdo em **43 arquivos** (42 de conteúdo + 1 apagado por nós e
  alterado por eles).

## Regras que decidiram

As mesmas das etapas 1 a 3: nosso trabalho tem prioridade quando colide (design
system/pele/molde de página, checkbox global, `components/ui`, app de celular, Funil
#200/#201/#206/#207, conversão por etapa #208/9054, marca só do platform admin #211,
poda do event_log #214/9057, integrações 9055/9056/9058, provider verdash/FZAP, `es`,
faixa 9xxx); do upstream entra tudo o que não colide; mesma função alterada pelos dois
= integra. **Troca de funil move o MESMO card, nunca clona.**

## Banco

### Colisão de timestamp

Nenhuma. As 19 migrations novas não repetem timestamp nem número de nenhuma nossa;
nada foi renumerado. Três delas (0685, 0686, 0688, `20261020000002..05`) caem DEPOIS
da 9058 (`20261020000000`), então a 9059 nasce com `20261020100000`, a última da
cadeia. `scripts/checar-colisao-de-migration.sh origin/dev` limpo.

### Objetos redefinidos pelos dois lados → migration `9059`

Conferido por nome de função, policy, constraint, view e trigger: das 19 novas, só a
0677 redefine um objeto que o fork endureceu.

| objeto | upstream | fork | o que se perdia |
|---|---|---|---|
| `fn_vocabulario_de_tags_operar` | 0677 (#2801) | 9038 / 9058 | a 9058 roda depois da 0677 e devolvia a versão da 9038: renomear que junta voltava a perder a cor e a resposta ficava sem `juntou` |

`20261020100000_9059_integracao_da_subida_1_85.sql` deixa a versão INTEGRADA (a da
9058 letra a letra, mais a declaração de `v_juntou`, o bloco (e0), o `order by` pelo
metadado e a chave `juntou` no retorno). As policies novas da 0680
(`crm_tasks_write`, `calendar_appointments_write`) já trazem o papel no USING; a 0685
não mexe em `emit_event` nem nas policies que endurecemos.

#### P2 do parecer da #215: `accent_dark_hex` pelo caminho da organização

A cor do tema escuro (#2482, 0627) tinha CHECK só em `platform_branding`. Na
organização ela mora em `settings.branding` e é gravada pela
`fn_definir_marca_da_organizacao` (0406), que conferia `accent_hex` e deixava
`accent_dark_hex` passar cru (só a action, com Zod e normalização, segurava). A 9059
redefine a função (corpo da 0406 letra a letra, permissões iguais) com a mesma regex e
o mesmo 22023 (`marca_da_organizacao_accent_dark_hex_invalido`). Provas:
`tests/invariants/marca-da-organizacao.test.ts` (seis formas ruins recusadas sem
gravar, `#aabbcc` grava) e `tests/unit/branding-cor-escura-da-organizacao.test.ts` (o
valor ruim nunca chega ao CSS; o CSS sai de `derivarMarca`).

### baseline.sql

O merge de texto alinhou o nosso bloco 9005..9058 com os apêndices novos do upstream e
deu 13 conflitos sem sentido. O arquivo foi remontado por partes, e a conferência de
multiconjunto de linhas (sem comentário) diz que nada do upstream novo e nada nosso
ficou para trás:

1. tudo antes do bloco 9005 (nosso + as edições do upstream no meio do arquivo, que o
   merge aplicou sem conflito);
2. os apêndices novos do upstream que ele põe ANTES da VARREDURA anon (0676, 0674, 0677,
   0678, 0680, 0682, 0686, 0665, 0667, 0679, 0668, 0681, 0685, 0688);
3. os nossos blocos 9005..9058;
4. bloco "SUBIDA 1.85 (migration 9059)" com as duas funções, ANTES da VARREDURA (cria
   função);
5. a VARREDURA anon e os apêndices pós-varredura, com os nossos cortes;
6. os apêndices novos do upstream que ele põe no FIM (0618, 0675, 0683);
7. o apêndice da Tektus, que continua no FIM.

### Índices e backfills desta etapa (produção)

- `crm_leads_webhook_source_idx` (0683, parcial em `crm_leads`): criar `concurrently`
  antes. A 0683 também faz **backfill** de `crm_leads.webhook_source_id` com UPDATE em
  `crm_leads` (só `source = 'webhook'` e nulo): fora do pico, com `lock_timeout`.
- `uq_ai_agent_versions_org_id` (0665, único em `ai_agent_versions`) e
  `ai_agent_version_channels_por_numero_idx` (tabela nova): pequenas.

## Decisão por arquivo em conflito

| arquivo | decisão | detalhe |
|---|---|---|
| `CHANGELOG.md` | os dois | nosso [Não lançado] em cima, 1.82–1.85 do upstream abaixo |
| `package.json` | integrado | `test:shell` do upstream + nosso `upstream-sync-intersecao`; `pnpm-lock.yaml` do upstream, refeito pelo `pnpm install` |
| `supabase/baseline.sql` | remontado | ver acima |
| `lib/agent-engine/agent/destino-da-intencao.ts` (+ testes) | integrado | o card ADICIONAL de outro produto (#2799, `abreCardAdicionalNoFunil`) entra: é um segundo negócio, a origem não é tocada. No funil de ENTRADA a troca segue com `moverNegocioDeFunil` (9053). `title`/`source` entram no select (o card adicional leva a identidade). `destino-da-intencao-produtos.test.ts` mocka a nossa troca |
| `lib/leads/abre-card-adicional.ts` (fora de conflito) | ajustado | o tipo `OrigemParaClonar` saiu com o clone; tipo próprio `OrigemDoCardAdicional` |
| `lib/automation/actions/create-or-move-lead.ts` | os dois | o `getAction` nosso + `mensagemDeErro` do upstream |
| `lib/schemas/webhooks.ts` | integrado | `media_url` no `send_whatsapp_message` (#2734) com as nossas ações; **P2 da #215**: o comentário da exceção #2769 dizia "cria um card NOVO", agora diz que move o mesmo card (9053) |
| `app/app/webhooks/_components/ActionConfigForm.tsx` | integrado | `media_url` no tipo, com os nossos `create_or_move_lead`/`create_lead_in_pipeline` |
| `lib/automation/actions/start-message-flow.ts` | os dois | o roteiro de atendimento (#2647) do upstream + o nosso `falaComOCliente` |
| `lib/followup/graph-schema.ts`, `lib/agent-engine/agent/followup-turn.ts` | os dois | `variants`/`move_stage`/`tag` e a cadência nossos + a mídia do passo (#2734) |
| `lib/agent-engine/agent/inbound-turn.ts` | nosso | a `aberturaInbound` ganhou o `origemBlock` do upstream |
| `lib/waha/ingest.ts`, `lib/channels/alteracao-de-mensagem.ts` | integrado | editar/apagar seguem pela conferência de autoria (nossa); do upstream: as FORMAS do id (o evento traz só a cauda, a recebida foi gravada com o composto) e o chat em `after` na apagada |
| `lib/kanban/filters.ts` | nosso | o "atrasado" do fork compara o prazo do próximo passo com `agora`; o `diaDeHojeLocal` (#2935) não se aplica |
| `lib/i18n/dicionario.ts` | os dois | seis chaves repetidas uma vez só |
| `lib/inbox/filtros-ativos.ts`, `hooks/inbox/useConversationCounts.ts`, `app/api/v1/conversations/counts/route.ts`, `components/inbox/InboxFilters.tsx`, `tests/unit/badge-espelha-o-filtro.test.ts` | nosso | **fora**: o filtro por atendente do gerente (66efa6ee8). O fork já tem "Responsável" (9051, a mesma coluna `assigned_to_user_id`) e as contagens por `fn_contagens_da_caixa` |
| `components/inbox/InboxLayout.tsx` | integrado | o LOTE (#2484 F1: seleção, barra de ações, rota `/conversations/bulk`) dentro da nossa grade; **fora**: o recolher do painel (#3004, o fork tem a coluna do lead que abre e fecha) e as divisórias (#2579, já fora na 1.81) |
| `components/inbox/ConversationList.tsx`, `ConversationListItem.tsx` | integrado | a caixa de seleção é o `<input type="checkbox">` nativo com a pele global do DS, IRMÃ da linha (nunca dentro do `<button>`); o resto da linha é a nossa |
| `components/inbox/CRMSidePanel.tsx` | nosso | o painel em abas. Perder pelo painel (#2871), abrir no funil (#3004) e levar a outro funil em Leads recentes já existem nas abas (`AcoesDoNegocio`, `MenuDoLead`) |
| `components/inbox/ConversationHeader.tsx`, `cabecalho/TransferirPopover.tsx` | nosso (+ do upstream) | as guias curtas (#3003) em `title` de Liberar (com `liberarDevolveAoAutomatico`), Reabrir, Fechar e Transferir |
| `components/inbox/Composer.tsx`, `composer/DialogosDoComposer.tsx` | integrado | resposta rápida com imagem (#2526: fila de anexos, `enviarAnexos`, prévia com remover) e o curinga digitado interpolado no envio (#2891) no nosso composer em peças |
| `components/inbox/composer/ReplyReviewPanel.tsx` | nosso (+ do upstream) | o motivo do veto (#2975) no painel que usa o nosso `useSugestaoDeResposta` |
| `components/inbox/ConversationTagsEditor.tsx` | integrado | o `criar` do upstream (#2789) gravando por DELTA (9045) |
| `components/kanban/LoseLeadDialog.tsx` | nosso | `motivosDoFunil`/`aoConcluir` já cobriam o `motivos`/`onPerdido` do upstream |
| `components/kanban/LeadFieldsForm.tsx`, `components/inbox/painel/CabecalhoDoPainel.tsx` | os dois | o editor de etiquetas do negócio (#2979, `entityId`) |
| `app/app/contacts/_client.tsx`, `components/contacts/ContactsTable.tsx` | integrado | exportar CSV/vCard (#2759) no `CabecalhoDaPagina` e o lote de contatos (#2484 F3) dentro do `EstadoDaLista`; caixas de seleção nativas |
| páginas com molde (`ai/agents`, `settings/atualizacao`, `settings/billing`, `integracao-dados/[id]`) | integrado | nosso `Pagina`/`CabecalhoDaPagina`; do upstream: "agente" no lugar de "agent", aviso de SMTP, troca proporcional de plano, painel de fontes liberadas |
| `components/admin/tenants/CardDeCobranca.tsx` (fora de conflito) | ajustado | o `Input` voltou ao import (o upstream usa nos campos novos) |
| `app/api/v1/contacts/[id]/crm-summary/route.ts` | nosso | `motivos_de_perda` uma vez só |
| `tests/invariants/hardening-definer-varredura.test.ts` | do upstream | `fn_set_channel_routing` com os 6 argumentos (0663) |
| testes e2e/unit da etapa pela conversa e da agenda | nosso / os dois | o seletor do fork; `useUser` + `usePermission` no mock |

## O que do upstream ficou de fora, e por quê

1. **Recolher o painel do contato (#3004)**: o fork já abre e fecha a coluna do lead
   (`useFerramentasDaConversa`). Saíram `togglePainelDoContato`, o cookie e o teste.
2. **Filtro por atendente do gerente (commits 66efa6ee8, 0dc9e2565 e b38d82310)**: é o nosso "Responsável"
   (9051). Saíram o `SeletorDeAtendente` na faixa e o teste das setas.
3. **Caixas de seleção desenhadas como `<button role="checkbox">`**: viram o checkbox
   nativo com a pele global (regra do DS).

## Pontos para o @Cassio_SecRev

- A 9059 é a única migration nova nossa. Duas funções, as duas `security definer`, com
  as mesmas permissões de antes (`_operar`: authenticated + service_role, com a guarda
  da 9038 dentro; `_marca`: só service_role).
- `aplicarAlteracaoDeMensagem` passou de `eq(external_id)` + `maybeSingle` para
  `in(external_id, formas)`; a conferência de sessão, direção e conversa continua
  valendo para a linha escolhida.
- O card adicional (#2799) abre um segundo negócio só quando o roteador declara funis
  de produto; contato bloqueado ou anonimizado não ganha card.

## Validação

Ver a descrição do PR.
