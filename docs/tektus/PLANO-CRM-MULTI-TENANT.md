# CRM Tektus — análise e plano de multi-tenant

> Documento de decisão. Escrito em 2026-09-11 a partir de leitura direta do código
> do fork `Agenciatektus/CRM-Deskcomm`, do upstream `melgarafael/DeskcommCRM`, do
> repositório do Verdash e da documentação do FZAP.
> Autor: sessão Claude Code · Revisor: Peterson.

---

## 0. Veredito

O fork **não precisa virar multi-tenant: ele já é.** `organizations` +
`user_organizations` (4 papéis hierárquicos) + RLS em toda tabela via
`fn_user_org_ids()` + `platform_admins` cross-tenant + teste de isolamento +
audit log append-only + LGPD por tenant. Um usuário já pertence a várias
organizações e troca entre elas por cookie (`active_org`) — que é exatamente o
"trocar de cliente" que a Tektus faz no Verdash.

E como o modelo é **multi-cliente, não multi-agência** (§4) — cada cliente assina
e loga na própria conta — não há hierarquia nenhuma a construir por cima disso.

O trabalho real é outro:

1. **Consertar a base do fork** — ele não tem histórico (4 commits, snapshot
   squashed) e o upstream faz ~60 commits por dia.
2. **Construir a aba "Conectar com a Verdash"** na tela de conexão, com o
   handshake por código de pareamento — mais um provider `verdash` na camada de
   canais, que já tem 3. Isso cobre os dois cenários: instância própria do cliente
   ou a conexão que já existe no Verdash.
3. **Resolver a cobrança.** Assinatura self-serve sem billing não fecha, e o CRM
   não tem nada disso.
4. **Decidir quem é dono de qual verdade** entre Verdash e CRM, para não criar
   dois funis concorrentes.

Os itens 1, 2 e 4 rodam local. O 3 é decisão de produto antes de ser código —
e o Verdash já resolveu esse problema uma vez.

---

## 1. O que é o CRM-Deskcomm

**DeskcommCRM**, de Rafael Melgaço. MIT — livre para modificar, fechar e revender.
Next.js 16 (App Router) + Supabase (Postgres/Auth/Realtime/Storage) + WAHA para
WhatsApp + workers em fila sobre `event_log`.

### Maturidade — medida no fork em 2026-09-11, não citada de documento

| Métrica | Valor |
|---|---|
| Arquivos TS/TSX (`app`+`lib`+`components`+`workers`) | 1.708 |
| Route handlers (`app/**/route.ts`) | 254 |
| Migrations | 214 |
| Testes unitários (`*.test.ts(x)`) | 927 |
| Invariantes de banco (`tests/invariants/`) | 191 |
| Specs E2E (`tests/e2e/`) | 104 |
| Documentos em `docs/` | 181 |

Isso não é um projeto de fim de semana. É um produto com CI de 5 checks
obrigatórios, ADRs, doutrinas escritas, threat model e um `docs/current-state.md`
que declara a própria data de validade e avisa o leitor a remedir antes de agir —
prática que quase ninguém tem.

### O que já está pronto e que interessa à Tektus

- **Multi-tenancy real.** `organization_id NOT NULL` em toda tabela tenant-aware,
  RLS via helper `SECURITY DEFINER`, e a regra certa escrita na doutrina:
  service role bypassa RLS, então handler admin filtra `organization_id`
  manualmente **de fonte confiável (cookie/JWT/webhook secret), nunca do body**.
- **RBAC de 4 papéis** com hierarquia: `viewer` < `agent` < `manager` < `admin`,
  server-side em toda a API, mais `platform_admins` para quem cruza tenants.
- **Inbox WhatsApp** de 3 painéis em tempo real, multi-número, mídia em Storage
  privado com URL assinada, anti-banimento (throttle + jitter + janela de
  horário) e detecção de STOP.
- **Funil kanban** com vocabulário configurável por nicho, customer 360,
  contatos, tags.
- **IA nativa por tenant**: agente com RAG (pgvector), análise de sentimento,
  handoff IA→humano, orçamento por organização, servidor MCP interno.
- **LGPD**: export e anonimização em cascata via workers, consentimento auditado.
- **Automação**: regras QUANDO/SE/ENTÃO, webhooks de captação, follow-up
  inteligente com gatilho de silêncio.
- **Camada de canal plugável** — a peça mais importante para nós. Ver §3.

### O que NÃO tem (e você vai sentir falta)

| Lacuna | Impacto para a Tektus |
|---|---|
| **Nenhum billing/cobrança** | **Bloqueador de lançamento.** O cliente compra a assinatura e loga sozinho (§4) — sem cobrança, não há produto. Nem planos, nem gateway, nem suspensão por inadimplência. |
| **Branding é singleton** (`platform_branding.id = 1`) | White-label da *instalação* inteira, não por cliente. "Tektus CRM" sim; "CRM do Studio L" não. Aceitável no modelo escolhido. |
| **WAHA é global por instalação** | `WAHA_API_BASE_URL` vem do `.env`. Existe `WAHA_BYO_ENCRYPTION_KEY` declarada em `lib/env.ts`, mas **sem implementação** — BYO-WAHA por tenant é intenção, não recurso. |
| **Sem "conectar com a Verdash"** | A tela de conexão só oferece QR, Meta e parceiro. A aba nova é o trabalho da §3. |
| **Rate limit em 2 pontos só** | O próprio `threat-model.md` §T1 assume: a superfície de auth está sem. Pesa mais quando o cadastro é self-serve. |

---

## 2. O que é o Verdash, e por que os dois não competem

O Verdash tem uma decisão de produto **já travada em 2026-06-14** (épica #696) que
resolve metade desta conversa antes dela começar:

> Inbox = **"Cockpit do Gestor"** — supervisionar, auditar e intervir no funil.
> **NÃO é atendimento operacional.** Esse fica no Chatwoot/Kommo.
> Core do Verdash = **atribuição**, não atendimento.

E o estudo de mercado de 2026-07-11 (`docs/strategy/crm-clientfacing-estudo-mercado-2026.md`)
concluiu que a whitespace brasileira é *CRM cliente-facing com atribuição nativa +
white-label de agência + apresentação + BR*, e recomendou **reusar o que existe em
vez de clonar o GHL**. A decisão de produto ficou pendente.

**O CRM-Deskcomm é a resposta a essa pendência.** Ele é exatamente o pedaço que o
Verdash decidiu conscientemente não ser, pronto, sob MIT, e mais maduro do que
seria viável construir do zero neste ano.

### O que o Verdash tem que o CRM vai querer

| Ativo do Verdash | Onde vive |
|---|---|
| Hierarquia `agencias` → `clientes` | tabelas `agencias`, `clientes` |
| 1 instância FZAP por cliente, com token próprio | `tracker_instancias` (`cliente_id UNIQUE`, `fzap_token`) |
| Funil por cliente | `tracker_etapas`, `tracker_leads` |
| Conversas e mensagens | `mensageria_conversas`, `mensageria_mensagens` |
| Atribuição anúncio→lead→venda | `tracker_*`, CAPI, canonical |
| Ingestão de venda externa | edge `webhook-saas-conversions` (auth `x-verdash-secret`) |

### Risco que precisa de decisão explícita

Verdash e CRM têm, cada um, **um funil**. `tracker_etapas`/`tracker_leads` de um
lado, `crm_stages`/`crm_leads` do outro. Dois funis sobre a mesma conversa é a
receita conhecida de dado divergente.

**Recomendação:** para o cliente que usar o CRM, o **CRM é a verdade do funil
operacional** e o Verdash recebe o evento. Isso inclusive melhora o que existe
hoje: no Verdash a etapa muda quando o atendente digita uma *frase-gatilho* no
WhatsApp (`tracker_etapas.termo_chave_jornada`); arrastar um card é melhor que
decorar frase. O Verdash segue dono absoluto da **atribuição** — que é o que
ninguém mais faz bem.

---

## 3. A ponte técnica: um adapter resolve os dois cenários

O CRM tem uma abstração de canal séria em `lib/channels/`:

```
ChannelAdapter             → tradutor de formato de UM canal, e nada mais
capabilitiesOf()           → o que o canal PERMITE (janela, template, ban risk)
channel_sessions.provider  → coluna com CHECK + tagged union por provider
scripts/lint-channels.ts   → reprova nome de provider fora de lib/channels/
```

Três providers já convivem: `waha`, `meta_cloud`, `zernio`. Adicionar `verdash` é
o quarto — caminho já trilhado duas vezes, com lint e testes cobrando.

### Achado 1 — o FZAP aceita múltiplos webhooks por instância

`GET/POST /webhook` do FZAP: *"Supports multiple webhooks per user"*, cada um com
URL, lista de eventos e **headers próprios** (inclusive `Authorization`).

Consequência direta: **o CRM pode escutar a mesma instância que o Verdash já usa,
sem derrubar o webhook do Verdash.** Era o maior risco do plano "puxar a conexão
do Verdash", e ele não existe.

### Achado 2 — o FZAP fala WAHA

O FZAP expõe uma camada de compatibilidade em `/waha/api/...` (doc
`22-compatibilidade-waha.md`): `sendText`, `sendImage`, sessões, QR, contatos,
grupos, e até o mesmo formato de ID de mensagem (`true_5511...@c.us_MSGID`).

Isso permite um teste de viabilidade **sem escrever uma linha**: apontar
`WAHA_API_BASE_URL` para `https://fzap.../waha`. Mas não é o destino, por três
motivos medidos na própria doc:

1. A autenticação é pelo **`adminToken` global** do FZAP — quem o tem opera
   *todas* as instâncias. Isso fura o isolamento por tenant.
2. **Envio de mídia exige o bundle de licença `WAHA_MEGA`** — e a licença do FZAP
   já nos deu intermitência documentada (fallback de validação da Flouds
   derrubando `/paid-traffic` em agosto).
3. A própria doc diz: *"Esta camada não é a API primária. Para novos projetos, use
   a API nativa."*

### O desenho recomendado

Um adapter `fzap` nativo, com credencial **por sessão** (o `fzap_token` da
instância, criptografado), resolve os dois cenários que você pediu com o mesmo
código:

| Cenário | Como fica |
|---|---|
| **Cliente com instância independente** | Cria instância nova no FZAP; `channel_sessions` guarda o token dela. O cliente é dono da conexão. |
| **Cliente reaproveitando a conexão do Verdash** | Usa o `fzap_token` da `tracker_instancias` daquele cliente e registra um **segundo webhook** apontando para o CRM. Verdash e CRM escutam juntos. |

Do ponto de vista do CRM os dois casos são a mesma coisa: uma sessão com um
token. Quem decide qual token entra é o handshake abaixo.

---

### A tela: "Conectar com a Verdash"

Esta é a peça concreta, e é por onde o cliente passa.

A tela de conexões do CRM (`components/connections/ConexoesShell.tsx`) já é
organizada em abas, **nomeadas pela experiência e não pela sigla do provedor** —
é uma decisão deliberada que está comentada no código:

```
Números por QR  ·  API Oficial (Meta)  ·  Provedor parceiro  ·  Chamada de voz
```

A aba nova entra ao lado, com o nome que o cliente reconhece:

```
Números por QR · API Oficial (Meta) · Provedor parceiro · Chamada de voz · Verdash
```

Componente novo `CanalVerdashClient.tsx`, no mesmo padrão dos três que já existem.
Nenhuma das abas atuais muda.

### O handshake, passo a passo

O cliente **não** cola token nenhum, e a Tektus não configura nada à mão. O
vínculo é por **código de pareamento** — curto, uso único, validade de minutos,
com escopo de exatamente uma instância:

1. **No Verdash**, na tela de instâncias, um botão **"Gerar código para o CRM"**
   cria uma linha em `crm_pareamentos`: código, `agencia_id`, `cliente_id`,
   `instancia_id`, expiração, uso único.
2. **No CRM**, na aba Verdash, o cliente cola o código e clica **Conectar**.
3. O **servidor** do CRM (nunca o browser) chama
   `POST /functions/v1/crm-vincular-instancia` no Verdash, enviando o código mais
   a URL de webhook daquele tenant e um segredo gerado na hora.
4. O **Verdash** valida o código, queima-o, registra no FZAP um **segundo
   webhook** apontando para o CRM (com o segredo recebido no header) e devolve o
   material de conexão junto com `phone_number` e `display_name`.
5. O CRM grava `channel_sessions` com `provider = 'verdash'`, guarda a credencial
   criptografada, e o número aparece conectado — sem QR, sem escanear nada.

O código de pareamento foi escolhido em vez de OAuth por um motivo prático: ele
**não depende de o cliente ter login no Verdash**. O Verdash tem o mecanismo
(`agencia_convites` com `cliente_uuid`, aceite configurando `role='cliente'`), mas
a profundidade da RLS desse papel precisa ser conferida antes de qualquer fluxo
depender dela. Com código de pareamento, quem gera pode ser a Tektus, e o cliente
só cola.

### A decisão de segurança: o que o Verdash devolve no passo 4

| | **A — devolve o `fzap_token`** | **B — devolve um token do Verdash** |
|---|---|---|
| Envio | CRM fala direto com o FZAP | CRM chama o Verdash, que roteia |
| Latência de envio | mínima | +1 salto |
| Token da instância | passa a viver em dois sistemas | nunca sai do Verdash |
| Revogar o acesso | rotacionar no FZAP (afeta o Verdash junto) | `UPDATE` numa linha |
| Cliente com número oficial (Cloud API) | não funciona — precisa de outro caminho | funciona pelo mesmo botão |

**Recomendação: B para o envio, com a entrada vindo direto do FZAP.** O webhook de
entrada vai FZAP → CRM sem escala (é para isso que serve o segundo webhook), então
o volume alto — tudo que o cliente recebe — não atravessa o Verdash. Só o envio
passa por lá, e é o lado de menor volume.

Duas consequências boas de B, e elas não são detalhe:

- **O provider se chama `verdash`, não `fzap`.** O CRM não precisa saber o que roda
  por baixo. Se a Tektus um dia trocar o FZAP por outra coisa, nada muda no CRM.
- **O número oficial da Meta entra pelo mesmo botão.** O `mensageria-send` do
  Verdash já roteia por `tracker_instancias.provider` entre Cloud API e FZAP. O
  cliente clica "Conectar com a Verdash" e funciona nos dois casos.

### O que isso exige do lado do Verdash

Esta parte não existe hoje e precisa ser construída — é trabalho no repositório do
Verdash, não no do CRM:

| Peça | O que é |
|---|---|
| `crm_pareamentos` | tabela do código: escopo, expiração, uso único, auditoria |
| Botão "Gerar código para o CRM" | na tela de instâncias, ao lado do QR |
| `crm-vincular-instancia` | edge: troca código por credencial e registra o webhook no FZAP |
| Auth de máquina no envio | `mensageria-send` hoje só aceita **JWT de usuário** (`getUser`); precisa de um segundo modo, por token de integração com escopo de instância |
| Tela de vínculos | ver e **revogar** o acesso de um CRM a uma instância |

O auth de máquina é o item que merece atenção do `@Cassio_SecRev`: é uma
superfície nova de escrita, e a regra da casa é que token de integração carregue
escopo explícito (uma instância) em vez de herdar o alcance da agência.

### Custo estimado

```
supabase/migrations/XXXX_canal_verdash.sql     ~80 linhas (CHECK + colunas + índice)
lib/channels/adapters/verdash.ts              ~250 linhas
lib/channels/capabilities.ts                   +12 linhas
lib/channels/session-ref.ts                     +4 linhas
lib/channels/index.ts                           +2 linhas
app/api/v1/webhooks/verdash/[token]/route.ts  ~120 linhas
lib/verdash/{client,ingest,envelope}.ts       ~400 linhas
components/connections/CanalVerdashClient.tsx ~220 linhas
testes                                        ~350 linhas
```

Capabilities do `verdash` (mesma família do WAHA, é whatsmeow por baixo):
`freeformOutsideWindow: true`, `requiresTemplates: false`,
`canManageTemplates: false`, `banRisk: true`, `groups: "full"`,
`costPerMessage: false`.

---

## 4. O modelo: multi-cliente, não multi-agência

A distinção é do Peterson e ela fecha várias portas de uma vez, o que é bom:

> Este CRM tem como foco o **cliente da agência**. Não é para ser multi-agência.
> O cliente compra a assinatura, faz login na própria conta. Outro cliente assina
> e faz login na conta dele.

Ou seja: **uma instalação, N organizações isoladas, cada uma com seu próprio
login e sua própria assinatura.** Sem hierarquia de agência, sem revenda para
outras agências, sem `agency_admin`.

O modelo plano do CRM — `organization` = uma empresa — é exatamente isso. Nada a
construir em tenancy:

```
organizations        → 1 por cliente que assina
user_organizations   → os usuários daquele cliente (viewer/agent/manager/admin)
platform_admins      → a Tektus, para suporte — não para operar no dia a dia
active_org (cookie)  → troca de conta, para quem por acaso tiver duas
```

O que **não** entra, e é uma economia relevante: `agencies`,
`organizations.agency_id`, papel de agência, branding por organização. Isso é o
"SaaS Mode" do GHL — que custa US$ 497/mês justamente por ser caro de construir e
sustentar. Fora de escopo por decisão, não por falta de tempo.

### O que essa decisão promove a requisito: billing

Se o cliente **compra a assinatura e loga na própria conta**, a cobrança deixa de
ser observação e vira bloqueador de lançamento. E o CRM não tem nada disso: nem
planos, nem assinatura, nem gateway, nem gate de acesso por pagamento.

Três caminhos, do mais barato ao mais caro:

| | Como funciona | Custo |
|---|---|---|
| **Cobrança fora do produto** | Link de pagamento manual; a Tektus ativa a organização à mão | Nenhum código. Não escala, mas valida o produto. |
| **Reusar o billing do Verdash** | O Verdash já tem billing self-serve com InfinitePay, quota e provisionamento por convite | Integração, não construção. É o caminho coerente. |
| **Billing nativo no CRM** | Planos, assinatura, webhook de pagamento, suspensão automática | Semanas. Só se o CRM virar produto independente do Verdash. |

**Recomendação:** cobrança fora do produto para os primeiros clientes, e o billing
do Verdash assim que passar de três. Construir billing nativo agora é resolver um
problema que ainda não existe — e o Verdash já resolveu esse uma vez.

---

## 5. O problema mais urgente: o fork não tem base

Este é o achado que muda o cronograma, e ele não é sobre features.

```
fork     Agenciatektus/CRM-Deskcomm → 4 commits, o 1º "thalena deskcomm" (08/09)
upstream melgarafael/DeskcommCRM    → 4.013 commits, HEAD em 11/09 (PR #721)
diferença medida em 11/09           → 498 arquivos, +30.271 / −1.418 linhas
git merge-base HEAD upstream/main   → vazio: NÃO existe ancestral comum
```

O fork é um **snapshot squashed**, não um fork do GitHub. Em três dias já ficou
30 mil linhas atrás, e o `merge-base` vazio confirma o pior caso: sem ancestral
comum, todo merge exigiria `--allow-unrelated-histories`, que resolve conflito
arquivo a arquivo no repositório inteiro.

### O ritmo do upstream — medido em 11/09

| | |
|---|---|
| Commits totais (desde 28/04/2026) | 4.013 |
| Commits nas últimas 24h | **105** |
| Commits nos últimos 7 dias | 278 |
| Commits nos últimos 30 dias | 1.850 |
| Releases nos últimos 7 dias | 8 (`v1.15.0` → `v1.19.0`) |
| Stars / forks | 1.336 / 495 |
| Autoria | Rafael Melgaço assina 3.493 dos 4.013 commits (87%) |

Cerca de 60 commits por dia e uma release a cada dia útil. Um fork sem ancestral
comum não sobrevive a esse ritmo — a cada semana de atraso o custo de reconciliar
cresce, e ele já nasceu com dívida.

**Do que o snapshot veio:** comparando a árvore contra cada tag, o commit inicial
`9346440` casa com **`v1.17.0`** (08/09) — 43 arquivos de diferença, contra 759 na
`v1.16.0`. Quando este documento foi escrito o upstream já estava em `v1.19.0`.

### O que o snapshot tem de nosso — e por que sai

A varredura do que existe do nosso lado e não no upstream devolveu, quase tudo,
arquivos do próprio upstream numa versão anterior: changesets pendentes em
`.changes/`, `.codex/`, `.agents/skills/`. Customização Tektus de verdade há uma
só, e ela é cara:

> O snapshot renomeou `hostgator-setup-kit/` → `setup-kit/` e
> `.env.hostgator.example` → `.env.vps.example`, tocando mais de 20 arquivos —
> docs, `docker-compose.*`, CI, rota de health, painel de atualização. O upstream
> mantém os nomes originais.

É o anti-padrão de fork na sua forma mais pura: um rename cosmético que atravessa
o repositório inteiro e **vai conflitar em todo merge, para sempre**, em troca de
nada funcional. Conviver com o nome `hostgator-setup-kit` é gratuito. Se o nome
incomodar de verdade, o caminho é um PR ao upstream propondo um nome neutro — não
um fork divergente que a Tektus paga sozinha.

E a colisão já aconteceu: o commit local `a2fbe2c` criou
`0231_waha_session_name_dentro_do_limite` (depois renumerada para `0232`) para
encurtar o nome da sessão WAHA. O upstream resolveu **o mesmo problema** em
`20260909190000_0232_nome_de_sessao_waha_cabe_no_teto_do_waha.sql`. Dois arquivos,
mesmo número, mesma intenção, nomes diferentes — exatamente o modo de falha que já
nos custou tempo no Verdash (colisão de prefixo em `schema_migrations`).

### Política de fork recomendada

1. **Refazer o repositório com o histórico completo do upstream** e reaplicar por
   cima só o que é nosso. Sem ancestral comum, toda atualização futura é manual.
2. **Descartar a nossa migration `0232`** em favor da do upstream. Ela resolve o
   mesmo problema e é a que o `baseline.sql` deles conhece.
3. **Customização só em arquivo novo.** Provider `verdash`, branding, seeds da
   Tektus. Editar arquivo do upstream é dívida que se paga em todo merge — e o
   rename do `setup-kit` acima é a prova de quanto ela custa.
4. **Branch `tektus/main`** separada da `main` que espelha o upstream; merge do
   upstream em cadência fixa (semanal), com `pnpm gov:verify` como portão.
5. **Contribuir de volta o que for genérico.** Um provider para FZAP é útil a
   qualquer usuário brasileiro do projeto; upstream que aceita o patch mantém ele
   para nós de graça.

---

## 6. Plano de execução — local, por fases

Nenhuma fase exige subir nada online. O que toca produção está marcado.

### F0 · Refundar o fork — meio dia

- Clonar o upstream completo e empurrar para `Agenciatektus/CRM-Deskcomm` com
  histórico (`--mirror`, ou refazer como fork real pela UI do GitHub).
- Reaplicar como commits nossos: nada, por enquanto — a `0232` local sai.
- Criar `tektus/main` e documentar a política de §5 no `CONTRIBUTING` do fork.
- **Saída:** `git log` com milhares de commits e `git merge upstream/main` limpo.

### F1 · Subir local e provar ponta a ponta — meio dia

Pré-requisitos: Node ≥ 22.13, pnpm, Docker Desktop, Supabase CLI.

```bash
pnpm install
cp .env.example .env            # preencher Supabase local + chaves
supabase start && supabase db reset
docker compose up -d waha       # devlikeapro/waha:noweb
pnpm dev                        # Next em :3000
pnpm worker                     # agente de IA
pnpm dev:crons                  # drena as filas
```

- Criar a primeira organização pelo onboarding.
- Parear um número de teste no WAHA local (QR).
- **Prova real:** mandar uma mensagem de WhatsApp de verdade e vê-la no inbox;
  responder pelo inbox e receber no celular. O `current-state.md` do upstream
  registra que essa é justamente a prova que costuma ser pulada — não pule.
- **Saída:** conversa real em `messages`, contato em `contacts`, lead no kanban.

> **Por que WAHA local e não FZAP nesta fase:** o webhook do FZAP exige **URL
> HTTPS pública** — `localhost` e `http://` são recusados (`08-webhook.md`). Com
> WAHA no mesmo Docker, o webhook é rede interna e não precisa de túnel. Para
> testar FZAP localmente depois, `cloudflared tunnel` resolve.

### F2 · Isolamento entre clientes — 1 dia

- Criar as organizações dos 2–3 clientes piloto.
- Cadastrar usuários de cada cliente e provar que um não enxerga o outro.
- Rodar `pnpm test:invariants` (191 invariantes, inclui isolamento de tenant).
- **Revisão `@Cassio_SecRev`** sobre os handlers que usam service role: a regra do
  projeto é filtrar `organization_id` de fonte confiável, e é aí que vaza
  cross-tenant quando vaza.
- **Saída:** dois clientes coexistindo sem enxergar um ao outro, provado por teste.

### F3 · Lado Verdash: o vínculo — 3 a 4 dias · repositório do Verdash

Esta fase é pré-requisito da F4 e não acontece no CRM.

- Tabela `crm_pareamentos` (escopo de uma instância, expiração, uso único).
- Botão **"Gerar código para o CRM"** na tela de instâncias.
- Edge `crm-vincular-instancia`: troca o código pela credencial e registra o
  segundo webhook no FZAP.
- Segundo modo de auth no envio (token de integração com escopo de instância) —
  hoje `mensageria-send` só aceita JWT de usuário.
- Tela para **revogar** um vínculo.
- **Revisão `@Cassio_SecRev`** — é superfície nova de escrita com token de máquina.
- **Saída:** um código gerado no Verdash vira credencial válida, e dá para cortar.

### F4 · Lado CRM: a aba "Conectar com a Verdash" — 4 a 6 dias

Escopo em §3. Ordem: migration do provider → `lib/verdash/client` → adapter →
capabilities → session-ref → rota de webhook → `CanalVerdashClient.tsx` →
testes → `pnpm lint:channels` verde.

- A aba entra ao lado das três que já existem; nenhuma delas muda.
- Piloto com **um cliente de baixo volume**, e o webhook do Verdash **não** é
  tocado — só acrescentado um segundo ao lado.
- Verificar em produção que o Verdash **continua** recebendo (`tracker_leads` e
  `mensageria_conversas` seguem populando).
- Ligar a direção única **CRM → Verdash**: mudança de etapa e venda fechada viram
  evento para a edge `webhook-saas-conversions`, que já existe. O Verdash não
  passa a escrever no CRM.
- **Saída:** o cliente cola um código e o WhatsApp dele aparece conectado, sem QR.

> Fase com risco real sobre dado de cliente em produção — é a única até aqui.

### F4b · Instância própria do cliente — 1 a 2 dias

O caminho "cliente que não usa Verdash": criar instância nova no FZAP pelo mesmo
adapter. O código do F4 já cobre quase tudo; o que muda é quem provisiona.

### F5 · Cobrança — decisão antes de código

Sem isso não há assinatura (§4). Começar por cobrança fora do produto com ativação
manual; integrar o billing do Verdash quando passar de três clientes.

### F6 · Marca — 1 dia

`platform_branding` com a marca da Tektus (verde `#00FF85`) e `show_powered_by`.
Branding por organização fica fora: no modelo escolhido todos os clientes veem a
mesma marca, e é isso mesmo.

### F7 · Produção — quando você quiser

O projeto tem `setup-kit/` com instalação em um comando e runbook próprio. A VPS30
já hospeda Verdash, FZAP e Chatwoot; um CRM com app + worker + scheduler + Redis
pede RAM dedicada. Avaliar VPS separada antes — há incidente registrado de build
morto por OOM no Coolify compartilhado.

---

## 7. Riscos, com o tamanho de cada um

| Risco | Gravidade | Mitigação |
|---|---|---|
| Fork sem histórico vs upstream muito rápido | **Alta** | F0. Sem isso, toda atualização é manual e o fork apodrece. |
| Dois funis (Verdash × CRM) divergindo | **Alta** | Decisão de §2: CRM dono do funil operacional, Verdash da atribuição. |
| `adminToken` global se usar a camada `/waha` do FZAP | Média | Adapter nativo com token por sessão (F3). |
| Licença FZAP intermitente derruba mídia (`WAHA_MEGA`) | Média | Adapter nativo não depende do bundle WAHA. |
| Webhook FZAP sem retentativa (evento perdido se >5s ou erro) | Média | Handler que só enfileira e responde 200 rápido — padrão que o CRM já usa. |
| Sem billing, com assinatura self-serve | **Alta** | Cobrança fora do produto no começo; billing do Verdash depois. Sem isso não há lançamento. |
| Token de máquina novo no Verdash (auth de envio) | **Alta** | Escopo de uma instância, revogável, revisão `@Cassio_SecRev` na F3. |
| RAM da VPS30 | Média | VPS separada na F6. |
| Rate limit ausente na superfície de auth | Baixa-Média | Conhecido pelo upstream (`threat-model.md` §T1); avaliar antes de expor à internet. |

---

## 8. Decisões que dependem de você

**Já decididas** (Peterson, 12/09): multi-cliente e não multi-agência; cada
cliente assina e loga na própria conta; a conexão do Verdash é oferecida como
opção na tela de instância.

Restam quatro:

1. **O que o Verdash entrega no vínculo: A ou B?** (§3) Recomendo **B** — token do
   Verdash com escopo de instância, envio via Verdash, entrada direto do FZAP.
   Mantém o token da instância dentro do Verdash, torna a revogação trivial e faz
   o número oficial da Meta funcionar pelo mesmo botão.
2. **Como cobrar no começo?** (§4) Recomendo **cobrança fora do produto** com
   ativação manual até o terceiro cliente, e o billing do Verdash depois.
3. **Cliente piloto da F4.** Volume baixo, instância ativa no Verdash e paciência
   para um teste em produção.
4. **Contribuir o provider de volta ao upstream?** Recomendo que sim: reduz o
   nosso custo de manutenção e não entrega vantagem competitiva nenhuma — a
   vantagem está na atribuição do Verdash, não no encanamento do WhatsApp.
