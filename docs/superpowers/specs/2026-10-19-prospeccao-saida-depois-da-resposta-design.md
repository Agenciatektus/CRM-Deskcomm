# Prospecção: oferecer a saída depois da primeira resposta

> Spec de design + plano de implementação. Medido em `origin/main` = `e593c58b0` (19/10/2026).
> Destino: **núcleo** (é um modo da prospecção nativa, que é núcleo; sem a opção ligada, nada muda).

## 1. O problema

Hoje toda primeira mensagem da prospecção sai com a saída colada no fim, sem opção:

```
Oi, tudo bem? Aqui é da Padaria Central?

Se não quiser mais receber mensagens, responda PARAR.
```

Quem monta isso é `comSaida()` (`lib/prospecting/rodape-de-saida.ts`), chamado em um único lugar,
`lib/prospecting/worker.ts:291` (`body: comSaida(generated.texto, locale)`), e vigiado por
`tests/unit/prospeccao-oferece-saida-e-a-saida-funciona.test.ts`.

Para quem prospecta por WhatsApp não oficial (WAHA), a primeira mensagem é a de maior risco de
banimento: o número fala com quem nunca falou com ele. Um "responda PARAR" logo na primeira linha
faz a mensagem **parecer disparo em massa** — é o padrão de texto de campanha, e o que a pessoa vê
antes de decidir se responde. A experiência de quem opera (relato de uso real, não medido no
produto) é que uma abertura humana e curta — "oi, tudo bem? é da [empresa]?" — recebe resposta, e
**a resposta da pessoa é o que mais protege o número**: depois que ela responde, a conversa deixa de
ser fria para o WhatsApp.

O que se quer é um **segundo modo**: a primeira mensagem só cumprimenta e confirma o contato, sem
oferta e sem a saída; a saída passa a ir **na primeira mensagem automática depois dela** — que é a
mensagem em que a empresa se apresenta e pede permissão para mostrar o serviço.

## 2. O que NÃO muda (as garantias que ficam)

1. **O bloqueio por "PARAR" continua valendo desde a primeira mensagem.** Ele não depende do
   rodapé: a ingestão (`lib/channels/pos-entrada.ts`, `ehPedidoDeOptOut` de
   `lib/opt-out/deteccao.ts`) roda em **toda** mensagem recebida. Quem responder à abertura com
   "PARAR" ou "pare de me mandar mensagem" é bloqueado igual a hoje. O que muda é só **quando o
   produto oferece a palavra**, não se ela funciona.
2. **O padrão continua sendo a saída na primeira mensagem.** Configuração gravada antes desta
   chave existir segue igual, sem ninguém editar nada (`.default()` no Zod).
3. **Não existe modo "nunca oferecer".** A doutrina de `rodape-de-saida.ts` vale inteira: sem saída
   oferecida, a saída que a pessoa usa é "Denunciar spam", que é invisível ao sistema e queima o
   número do cliente. O modo novo **adia** a saída para depois da resposta; nunca a remove.
4. **Sem saída na primeira, a primeira não pode ser oferta.** No modo novo o worker acrescenta à
   instrução fixa da abertura que ela **não apresenta serviço, preço nem proposta** — só cumprimenta
   e confirma se falou com a empresa certa. É isso que torna o adiamento defensável: a mensagem sem
   saída não é comercial; a primeira mensagem comercial leva a saída.

## 3. Comportamento

Configuração nova da campanha: `exit_offer`.

| valor | primeira mensagem (abertura) | primeira mensagem automática depois dela |
|---|---|---|
| `first_message` (padrão) | texto + saída — **igual a hoje** | sem saída — igual a hoje |
| `after_reply` | só o texto; instrução fixa proíbe oferta | texto **+ saída**, uma única vez |

"Primeira mensagem automática depois dela" = a primeira que sair por um destes dois caminhos,
o que vier antes:

- **o agente respondendo a pessoa** (`send_message` em `lib/agent-engine/agent/inbound-turn.ts`) —
  o caso normal: a pessoa respondeu "sim, é daqui", o agente se apresenta e pede permissão;
- **um follow-up automático** (`lib/agent-engine/agent/followup-turn.ts`) — o caso em que a pessoa
  **não** respondeu e o operador ligou um follow-up na etapa. Sem isso, a segunda mensagem sairia
  sem saída para quem nunca respondeu, que é exatamente o caso de maior risco.

Regra que resume: **no modo `after_reply`, nenhuma segunda mensagem automática sai sem a saída.**

A saída é a mesma de hoje (`rodapeDeSaida(locale)`: PARAR / BAJA / STOP pelo idioma da
organização), colada no fim do texto pelo mesmo `comSaida()` — determinística, nunca escrita pelo
modelo (as duas razões estão no cabeçalho de `rodape-de-saida.ts` e continuam valendo).

### Casos de borda (decididos)

| caso | o que acontece |
|---|---|
| a pessoa responde "PARAR" à abertura | bloqueada pela ingestão, como hoje; não há segunda mensagem |
| o agente manda 2 mensagens no mesmo turno | a saída vai na **primeira** delas; a reserva (§4) impede a segunda de repetir |
| a resposta sai em várias bolhas | a saída é colada antes do fatiamento (`sendInBubbles`), então vai no fim do texto — pode cair na última bolha, sozinha ou não |
| o guardrail veta a mensagem do agente | nada é reservado: a reserva só acontece dentro do `send`, depois da cadeia aprovar |
| o envio falha depois da reserva | a reserva é desfeita; a próxima mensagem automática leva a saída |
| um atendente responde primeiro pelo Inbox | o produto **não** escreve na mensagem do humano; a próxima automática leva a saída. A tela da campanha mostra "Saída ainda não oferecida" (§6) |
| aviso de escalação ao lead (`aviso-de-escalacao.ts`) | não leva a saída (é aviso operacional, não abordagem); a próxima automática leva |
| follow-up por modelo oficial da Meta (`template`) | não leva: o corpo do modelo aprovado não se altera. A prospecção hoje sai por texto (`type: "text"` no worker), então este caso só existe se o operador montar assim |
| agente em modo assistido (resposta aprovada, `approved-reply.ts`) | não leva: o texto aprovado por uma pessoa não pode mudar depois da aprovação (`reply_body_changed_reapproval_required`). O worker já exige `operation_mode='automatic'` para abordar; se o operador trocar o modo depois, a próxima automática leva |
| o modelo já escreveu "responda PARAR" no fim | `comSaida()` é idempotente: não duplica |
| campanha antiga, sem a chave | `first_message` — nada muda |

## 4. Dados

### 4.1 Configuração da campanha (sem migration)

`prospecting_campaigns.config` é `jsonb` validado por `campaignConfigSchema`
(`lib/prospecting/schema.ts`). Acrescenta-se:

```ts
// QUANDO a saída ("responda PARAR") é oferecida. `first_message`: na abertura (o de sempre).
// `after_reply`: a abertura só cumprimenta e confirma o contato, e a saída vai na primeira
// mensagem automática seguinte. Nunca "não oferecer": ver lib/prospecting/rodape-de-saida.ts.
exit_offer: z.enum(["first_message", "after_reply"]).default("first_message"),
```

A configuração não se edita depois de iniciada (só `adjust_pace` existe), então o modo é fixo por
campanha — o que é o certo: trocar no meio deixaria metade da fila com uma promessa e metade com
outra.

### 4.2 Saber se a saída já foi oferecida (migration)

Coluna nova em `prospecting_candidates`:

```sql
alter table public.prospecting_candidates
  add column if not exists exit_offered_at timestamptz;
```

Por que coluna e não inferência pelas mensagens: inferir "é a primeira automática?" contando
outbound da conversa erra quando um humano respondeu antes, e procurar o texto do rodapé nas
mensagens depende de redação. A coluna é a **reserva** que torna a regra "uma única vez" segura
contra dois turnos ou duas bolhas concorrentes:

```sql
-- reservar (atômico; devolve linha só para quem ganhou)
update public.prospecting_candidates p
   set exit_offered_at = now(), updated_at = now()
  from public.prospecting_campaigns c
 where p.organization_id = $1 and p.conversation_id = $2
   and p.status in ('sending','sent') and p.exit_offered_at is null
   and c.organization_id = p.organization_id and c.id = p.campaign_id
   and coalesce(c.config->>'exit_offer','first_message') = 'after_reply'
returning p.id, p.campaign_id, p.exit_offered_at;

-- desfazer (envio falhou)
update public.prospecting_candidates
   set exit_offered_at = null
 where organization_id = $1 and id = $2 and exit_offered_at = $3;
```

O filtro `status in ('sending','sent')` é o mesmo de `prospectingConversationContext`
(`lib/prospecting/context.ts`). O índice que serve a busca já existe
(`prospecting_conversation (organization_id, conversation_id)`).

No modo `first_message` o worker grava `exit_offered_at = now()` junto do `status='sent'` — assim a
tela diz a mesma coisa nos dois modos. **Sem backfill:** linhas antigas ficam `null` porque o
produto não sabe se elas levaram o rodapé (ele entrou depois da prospecção nativa); afirmar que
levaram seria inventar sinal que o banco não guarda.

**Isolamento:** as duas consultas filtram `organization_id` vindo da linha do job / da campanha
(fonte confiável), nunca de corpo de requisição. Nenhuma policy nova: a coluna entra numa tabela
que já tem RLS.

### 4.3 Tripla da migration

- `supabase/migrations/<timestamp>_<NNNN>_prospeccao_saida_depois_da_resposta.sql` com
  `-- manifest: prospecting_candidates.exit_offered_at — reserva da saída adiada (modo after_reply da prospecção)`.
  **Número:** o maior `NNNN` da `main` medido hoje é `0703`; o número real se tira na hora com
  `pnpm checar:colisao-de-migration` (há PRs de schema em voo).
- Apêndice idempotente no fim de `supabase/baseline.sql`: `-- ---- prospecção: saída adiada (migration NNNN) ----` + o mesmo `add column if not exists`.
- Nenhuma função nova em `public` (as consultas são SQL parametrizado no código), então a regra 9
  de revogar `EXECUTE` não se aplica.

## 5. Código — pontos medidos

| arquivo | mudança |
|---|---|
| `lib/prospecting/schema.ts` | `exit_offer` (§4.1) |
| `lib/prospecting/rodape-de-saida.ts` | nada muda nas funções; o cabeçalho ganha um parágrafo sobre o modo adiado e o porquê de não existir "nunca" |
| `lib/prospecting/saida-adiada.ts` (novo) | `reservarSaidaAdiada(db, org, conversationId)` → `{ candidatoId, campanhaId, reservadaEm, locale } \| null` e `desfazerReserva(db, org, candidatoId, reservadaEm)`. Lê `organizations.locale` (mesma fonte do worker) |
| `lib/prospecting/worker.ts` | `body: cfg.exit_offer === "after_reply" ? generated.texto : comSaida(generated.texto, locale)`; no modo adiado, a instrução fixa ganha a frase da §2.4; no `first_message`, `exit_offered_at=now()` junto do `sent` |
| `lib/prospecting/context.ts` | no modo adiado e com a saída ainda pendente, o contexto do agente ganha: "O sistema acrescenta ao fim da sua próxima mensagem a instrução de saída; não a escreva você." (evita o modelo redigir a sua própria versão, que o detector pode não reconhecer) |
| `lib/agent-engine/agent/inbound-turn.ts` | no `send: (finalBody) => …` do `send_message` (hoje ~linha 3660): fora de prévia, `reservarSaidaAdiada` → se reservou, `finalBody = comSaida(finalBody, locale)` antes de `corposEnviados.push` e do `enviarComFotos`; se o envio lançar ou não confirmar, `desfazerReserva` |
| `lib/agent-engine/agent/followup-turn.ts` | no `send: (finalBody) => channel.send(…)` (~linha 1221), o mesmo, **pulando** quando `modelo !== undefined` (template) |
| `app/api/v1/prospecting/route.ts` | o `select` dos candidatos passa a trazer `p.exit_offered_at` e `ct.is_blocked` (join em `contacts` pelo `contact_id`, com `organization_id`) |
| `app/app/prospecting/_client.tsx` | §6 |
| `lib/audit/actions.ts` | ação `prospecting.exit_offered` |
| `lib/i18n/dicionario.ts` | as strings novas da tela, com `es` |

**Custo dentro do lock do número:** o `send` do `inbound-turn` roda com o
`pg_advisory_xact_lock` do canal na mão (issue #654). A reserva acrescenta **uma** consulta
indexada ali, e só em conversa de prospecção — as outras conversas pagam uma consulta que não acha
linha. Se a triagem preferir, a alternativa é reservar em `esperaForaDoLock` e desfazer no veto; a
spec fica com o `send` por ser o único ponto em que "vai sair" é verdade.

**Relação com o PR #2680** (@webtecnica, aberto, mexe em `worker.ts` e no mesmo teste-cerca: o
corpo da abertura passa a sair em bolhas, `const corpo = comSaida(generated.texto, locale)`). As
duas mudanças são compatíveis — a deste PR vira `const corpo = cfg.exit_offer === "after_reply" ?
generated.texto : comSaida(…)`. Quem entrar depois resolve o conflito lendo os dois lados; não
reescrever o trabalho dele.

## 6. Tela

Em **Prospecção › 2. Preparar a abordagem**, logo abaixo de "Quando a empresa entra no funil", um
`fieldset` com o mesmo desenho (dois rádios):

- **Na primeira mensagem (padrão)** — "A abertura já diz como parar de receber: Se não quiser mais
  receber mensagens, responda PARAR."
- **Depois que a pessoa responder** — "A abertura só cumprimenta e confirma se é a empresa certa,
  sem oferta. A instrução para parar vai na mensagem seguinte, quando você se apresenta. Responder
  PARAR bloqueia o contato desde a primeira mensagem, nos dois modos."

Com o modo adiado marcado, um exemplo de instrução aparece abaixo do campo de instrução (texto de
ajuda, não preenchido sozinho): "Na primeira mensagem, só cumprimente e pergunte se é da empresa.
Quando a pessoa responder, apresente-se e peça permissão para mostrar o serviço."

No painel da campanha, ao lado de "Responderam", um número novo **"Pediram para parar"**
(`is_blocked` dos contatos da campanha). Na linha de cada empresa abordada, um rótulo pequeno:
"Saída oferecida" / "Saída ainda não oferecida" (só no modo adiado, quando `sent` e `null`).

## 7. Living System Checklist

1. **Quem me alimenta?** O operador, pelo rádio em `/app/prospecting` → `config.exit_offer`; a
   reserva é alimentada pelos dois caminhos de envio automático (`inbound-turn`, `followup-turn`).
2. **Quem eu alimento?** `comSaida()` → o corpo que vai ao canal; `exit_offered_at` → a tela da
   campanha e o contexto do agente (`context.ts`).
3. **Que registro emito?** `prospecting.exit_offered` em `api_audit_log` (metadata: `campaign_id`,
   `candidate_id`, `conversation_id`, `via: inbound_turn | followup`; sem texto nem telefone, como o
   `prospecting.approach_sent`). A mensagem em si fica na conversa.
4. **Onde apareço na tela?** Na conversa do Inbox (a mensagem com a saída), no rótulo da linha da
   empresa e no contador "Pediram para parar" de `/app/prospecting`.
5. **Por qual porta?** `/app/prospecting`, já no catálogo de navegação. Nenhuma tela nova.
6. **Anti-morte?** A saída pendente não morre: a reserva só se consome quando a mensagem sai, e
   volta a `null` se o envio falha — a próxima automática a leva. Quando um humano responde
   primeiro, o rótulo "Saída ainda não oferecida" é o aviso.
7. **Onde se configura?** O rádio da §6, por campanha. Falta de configuração = padrão de hoje.
8. **Continuidade IA↔humano?** O atendente que assume vê, na linha da empresa, se a saída já foi
   oferecida; o agente vê no contexto que não deve redigir a saída.
9. **Laço de retorno?** "Pediram para parar" ao lado de "Responderam", por campanha: o operador
   compara campanhas nos dois modos e vê se o adiamento trouxe mais respostas ou mais pedidos de
   parada. **Dívida declarada:** denúncia de spam e banimento não chegam ao sistema (o WhatsApp não
   avisa), então o laço mede o que dá para medir, não o risco inteiro.
10. **Mapa:** `docs/architecture/prospeccao-nativa.architecture.json` ganha a peça
    `saida-adiada` com as arestas `inbound-turn → saida-adiada`, `followup-turn → saida-adiada`,
    `saida-adiada → prospecting_candidates`.

## 8. Testes (e a sabotagem de cada um)

| teste | o que prova | sabotagem que tem de ficar vermelha |
|---|---|---|
| `tests/unit/prospeccao-oferece-saida-e-a-saida-funciona.test.ts` (atualizado) | `first_message` segue mandando `comSaida`; config antiga parseia como `first_message` | trocar o padrão do Zod para `after_reply` |
| `tests/unit/prospecting-worker.test.ts` (casos novos) | no adiado, o corpo é o texto cru **e** a instrução tem a frase de "sem oferta"; no padrão, `exit_offered_at` gravado | tirar a frase da instrução; tirar o `comSaida` do ramo padrão |
| `lib/prospecting/saida-adiada.test.ts` | reserva uma vez só; segunda chamada `null`; desfazer devolve; modo padrão não reserva | remover `exit_offered_at is null` do `where` |
| `inbound-turn` (caso novo) | primeira `send_message` de conversa de prospecção adiada sai com a saída; a segunda do mesmo turno não; prévia não reserva | **remover a chamada** em `inbound-turn.ts` (sabotar a ligação, não só o helper) |
| `followup-turn` (caso novo) | follow-up de texto leva a saída; de template não | remover a chamada em `followup-turn.ts` |
| `tests/invariants/` (novo, `pnpm test:db`) | a coluna existe depois de install e update do baseline; a reserva com `organization_id` da org B não toca linha da org A | trocar `p.organization_id = $1` por nada |
| `tests/e2e/` (spec nova ou caso na de prospecção, se houver) | o rádio aparece, nasce em "Na primeira mensagem", e a escolha sobrevive ao iniciar | — |

**Prova em par (o caminho passa por agente):** pela tela, uma campanha adiada com conexão de teste,
a abertura sai sem "PARAR", a pessoa responde "sim", a resposta do agente sai com "PARAR" no fim;
**e** `reservarSaidaAdiada` chamada direto para a mesma conversa devolve `null` (já consumida). Os
dois têm de concordar.

## 9. Fora do escopo

- Escrever a saída em mensagem de humano no Inbox.
- Modo "nunca oferecer a saída" (§2.3).
- Mudar a frase fixa da abertura no modo padrão ("os dados vieram de pesquisa pública…").
- Campanhas de envio em lote (`lib/campanhas/`), que têm regra própria de opt-out.

## 10. Entrega

- Fragmento `.changes/prospeccao-saida-depois-da-resposta.md`: `impacto: capacidade_nova`,
  `secao: adicionado`, título "A prospecção pode deixar a instrução para parar para depois da
  primeira resposta". `pnpm release:conferir`.
- `docs/features/prospeccao-nativa.md`: parágrafo do modo novo e dos casos de borda.
- Destino declarado no PR: **núcleo** — sem ninguém marcar o rádio, a operação comum continua
  idêntica.

## 11. Plano de implementação (ordem)

1. **Branch** de `origin/main` (esta: `spec/prospeccao-saida-depois-da-resposta`); `git fetch` e
   `pnpm checar:colisao-de-migration` para tirar o número.
2. **Tripla da migration** (§4.3) num commit só (o pre-commit cobra).
3. **Schema + helper** (`schema.ts`, `saida-adiada.ts` + teste) — teste primeiro, vermelho, depois o
   código.
4. **Worker** (ramo adiado, instrução, `exit_offered_at` no padrão) + teste-cerca atualizado. Se o
   #2680 já tiver entrado, partir da forma dele.
5. **Ligações**: `inbound-turn.ts` e `followup-turn.ts` + `context.ts`, com os testes de ligação.
   Commitar, depois sabotar cada ponto de chamada e anotar "N vermelho(s) de M, o previsto".
6. **Auditoria** (`actions.ts` + emissão no helper, fire-and-forget).
7. **API + tela + i18n** (`route.ts`, `_client.tsx`, `dicionario.ts`).
8. **Docs + mapa + fragmento.**
9. **Pré-voo** (`bash .agents/skills/deskcomm-contribuir/scripts/pre-voo.sh`) e os gates do CI pelo
   PR interno do fork (nesta máquina não se roda Docker de teste).
10. **Prova em tela** numa instalação de teste (abertura sem PARAR, resposta, segunda com PARAR,
    "PARAR" respondido bloqueando) com evidência em `evidence/prospeccao-saida/`; só depois o PR ao
    produto.

## 12. O que não medi

- O efeito real do adiamento sobre banimento e denúncia: é relato de operação, não número do
  produto, e o produto não tem como medir (o WhatsApp não avisa denúncia). O PR apresenta isso como
  hipótese do operador, e o contador "Pediram para parar" é o que o produto consegue observar.

Medido e fechado: nenhum teste fixa o texto da instrução da abertura
(`git grep "primeira abordagem curta"` só acha `worker.ts`), então acrescentar a frase do modo
adiado não quebra cerca existente.
