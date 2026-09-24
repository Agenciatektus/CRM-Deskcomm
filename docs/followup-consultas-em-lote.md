# Follow-up: consultas `.in()` que podem estourar a URL

> Registrado como documento e não como issue porque **este repositório tem issues
> desabilitadas**. Vive aqui para quem vier depois encontrar.
>
> Origem: PR #14 (24/09/2026) e as três rodadas de auditoria dela.

A PR #14 consertou o `.in()` que estourava a URL no quadro do funil e no `risk-seed`. Sobraram sítios da mesma classe, e este documento guarda **o que foi medido**, não o que foi suspeitado — a primeira varredura da auditoria listou sete e metade não se sustentou.

## Mordem, ou estão a um passo

**`app/api/v1/leads/proposals/route.ts:109`** — `leadIds = [...porLead.keys()]`, derivado de **todos os leads abertos** da organização, sem teto a montante. É rota **user-facing**, o parente mais próximo do bug consertado.

**Hoje não morde:** a Lior tem **0** linhas em `lead_state` com `next_action`, então `leadIds` fica vazio e a rota sai antes do `.in()`. Medido em produção. Está a um `next_action` de quebrar, com os mesmos 1.097 contatos.

## Limítrofes — ~500 ids ≈ 18,5 KB

Passam no gateway do CRM (600 ids → 22.199 b → 200, medido), mas **18,5 KB é exatamente onde o Supabase self-hosted do Verdash recusa**, com 414 em vez de 400:

- `lib/leads/radar-de-risco.ts:207,212,217` — `SCAN_CAP = 500`
- `app/api/v1/ai/followups/queue/route.ts:202,224` — `.limit(500)`, com o comentário *"fila é escala MVP; sobe se virar hot path"*. **Quem aumentar aquele 500 quebra a rota.**

## Erro engolido — risco classificado errado em silêncio

`lib/leads/risk-seed.ts`: o `{ data: jobs }` descarta o erro (era assim antes do lote também). Se a leitura de `cron_jobs` falhar, `followupPorContato` fica vazio e **todo lead é classificado como sem follow-up**. Não é regressão, é ruído antigo que agora tem dono.

`app/api/v1/pipelines/[id]/board/route.ts` (`avisaAmbiguas`): o docstring afirma que *"o erro sobe para o Sentry pelo caminho normal de exceção não tratada"*. **Não sobe** — é engolido. Consequência real: com a leitura de dedup falhando, insere item de caixa duplicado a cada refresh do quadro. O docstring precisa parar de prometer observabilidade que não existe.

## Quatro implementações de lote, quatro convenções

O repo já tinha três helpers com constantes divergentes, e a contagem revelou mais:

| onde | constante | nome da fatia |
|---|---|---|
| `lib/supabase/lotes.ts` (novo) | 150 | `lote` |
| `lib/extensions/service.ts:221` | 64 | `batch` |
| `lib/lgpd/cascata.ts:282` | 100 | `bloco` |
| `lib/leads/radar-de-risco.ts` | — | `fatia` |
| `cron/contact-birthdays`, `cron/lead-date-field-due` | — | `lote` (próprio) |

Só o de 150 tem a tabela de medição. Se for unificar, é por ele.

## Por que NÃO ampliamos a cerca de teste

A cerca da PR #14 reprova `.in(` cru em **um arquivo**, onde a regra é absoluta. Ampliar para `app/api/v1/` foi medido e descartado: são **35 arrays literais, 106 identificadores e 24 expressões**. O critério "literal passa, identificador exige lote" limparia 21% e sinalizaria 106 sítios legítimos — cerca que reprova o correto é cerca que alguém apaga.

O critério verdadeiro é "esse array pode passar de N em runtime?", que é pergunta de fluxo de dados e regex não responde.

**A alternativa que escala sem tocar nos 106:** traduzir a falha onde ela acontece. O custo inteiro deste bug foi um 400 chegando ao operador como "Bad Request". Uma tradução no caminho de erro (PostgREST devolveu 400/414 **e** a requisição era grande → *"lista grande demais para uma consulta só; use `consultarEmLotes`"*) converte qualquer ocorrência futura, em qualquer um dos 106 sítios, num erro que se explica sozinho.
