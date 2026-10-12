# Auditoria mobile, parte 2: as 63 telas do catálogo

Continuação de `auditoria-mobile.md` (separada para cada arquivo ficar abaixo de 300 linhas). O escopo é o CRM
inteiro: aqui está o tratamento de celular que cada destino de `lib/navigation/catalogo.ts` precisa, e em qual PR
do plano ele entra.

Tratamentos: **Aba** = vira aba ou tela do app (M2/M3); **Cartão** = lista ou grade vira cartões em 1 coluna, ações
em folha; **Empilhada** = tabela vira cartão chave-valor por linha; **Form** = diálogo ou página de formulário vira
tela cheia empilhada com rodapé fixo e campos de 16px; **Seg** = abas viram segmentado rolável; **Num** = gráfico e
números viram KPIs empilhados com gráfico rolável; **Consulta** = edição complexa (canvas, editor rico) fica em
leitura no celular, com aviso para editar no computador.

| # | Tela | Rota | Tratamento | PR |
|---|---|---|---|---|
| 1 | Prospecção (admin) | `/app/prospecting` | Empilhada + Form | M4.3 |
| 2 | Inbox | `/app/inbox` | Aba Conversas (telas 01-04 e 11) | M2 |
| 3 | Radar | `/app/radar` | Cartão por atendente | M4.3 |
| 4 | Agenda | `/app/agenda` | Aba Tarefas › Agenda (faixa de 7 dias) + Form | M3.2 |
| 5 | Respostas rápidas | `/app/templates` | Cartão + Form; também folha no composer | M4.3 |
| 6 | Funis | `/app/kanban` (+ quadro `/app/pipelines/[id]`) | Aba Funil (tela 06) | M3.1 |
| 7 | Campanhas | `/app/campaigns` | Cartão + Form em passos | M4.3 |
| 8 | Contatos | `/app/contacts` (+ `[id]`) | Empilhada + Form + ficha empilhada | M4.3 |
| 9 | Empresas | `/app/companies` | Empilhada | M4.3 |
| 10 | Pessoas | `/app/people` | Empilhada | M4.3 |
| 11 | Tarefas | `/app/tasks` | Aba Tarefas (tela 07) | M3.2 |
| 12 | Chamadas | `/app/calls` | Empilhada + Form | M4.3 |
| 13 | Produtos | `/app/products` | Cartão + Form | M4.3 |
| 14 | Importações | `/app/imports` | Empilhada; envio de arquivo em tela cheia | M4.3 |
| 15 | Propostas | `/app/proposals` | Empilhada | M4.3 |
| 16 | Tipos de agendamento | `/app/settings/tenant/agenda` | Form | M4.6 |
| 17 | Propostas (ajustes) | `/app/settings/tenant/proposals` | Form | M4.6 |
| 18 | Modelos de proposta | `/app/settings/tenant/proposals/modelos` | Cartão + Consulta (editor rico) | M4.6 |
| 19 | Comandas | `/app/comandas` | Empilhada + Form | M4.3 |
| 20 | Financeiro | `/app/settings/tenant/financeiro` | Cartão + Form | M4.6 |
| 21 | Etapas do funil | `/app/settings/tenant/pipelines` | Cartão; arrastar vira subir e descer | M4.6 |
| 22 | Agentes | `/app/ai/agents` (+ `[id]`) | Cartão; detalhe com Seg (6 abas) + Form | M4.4 |
| 23 | Follow-ups | `/app/ai/followups` | Seg + Empilhada + Form | M4.4 |
| 24 | Fluxos de atendimento | `/app/ai/atendimento` | Consulta (canvas) | M4.4 |
| 25 | Roteadores | `/app/ai/routers` | Cartão + Form | M4.4 |
| 26 | Credenciais | `/app/ai/credentials` | Cartão + Form | M4.4 |
| 27 | Provedores | `/app/ai/providers` | Cartão | M4.4 |
| 28 | Conhecimento | `/app/ai/knowledge/sources` | Cartão + Form (envio) | M4.4 |
| 29 | Memória | `/app/ai/memory` | Cartão + Form | M4.4 |
| 30 | Skills | `/app/ai/skills` | Cartão + Form | M4.4 |
| 31 | Casos | `/app/ai/cases` | Seg + Cartão | M4.4 |
| 32 | Alertas | `/app/ai/inbox` | Aba Avisos (tela 08) | M3.3 |
| 33 | Aviso no WhatsApp | `/app/ai/cases/avisos` | Form | M4.4 |
| 34 | Propostas da IA | `/app/ai/proposals` | Seg + Cartão | M4.4 |
| 35 | Execuções | `/app/ai/runs` | Cartão em linha do tempo | M4.4 |
| 36 | Uso e orçamento | `/app/ai/usage` | Num + Form | M4.4 |
| 37 | Conexões | `/app/connections` | Tela Canais (tela 10) | M4.1 |
| 38 | Nuvemshop | `/app/integrations/nuvemshop` | Form | M4.6 |
| 39 | Webhooks | `/app/webhooks` | Seg + Empilhada + Form | M4.6 |
| 40 | Faturamento | `/app/faturamento` | Num + Empilhada | M4.5 |
| 41 | Honorários | `/app/honorarios` | Empilhada + Form | M4.5 |
| 42 | Desempenho | `/app/metrics` | Num + Empilhada | M4.5 |
| 43 | Meta Ads | `/app/ads/meta` | Num + Empilhada | M4.5 |
| 44 | Atividades | `/app/activities` | Cartão em linha do tempo | M4.5 |
| 45 | Evolução da IA | `/app/ai/evolution` | Num | M4.5 |
| 46 | Audit Log | `/app/audit` | Empilhada | M4.5 |
| 47 | Perfil | `/app/settings/profile` | Form | M4.6 |
| 48 | Segurança | `/app/settings/security` | Form + Cartão (sessões) | M4.6 |
| 49 | Notificações | `/app/settings/notifications` | Empilhada: a matriz vira lista de interruptores | M4.6 |
| 50 | Equipe | `/app/team` | Seg + Empilhada + Form | M4.6 |
| 51 | Distribuição de atendimento | `/app/settings/atendimento` | Form | M4.6 |
| 52 | Etiquetas | `/app/settings/tags` | Empilhada | M4.6 |
| 53 | Recursos opcionais | `/app/settings/recursos` | Cartão de interruptores | M4.6 |
| 54 | Organização | `/app/settings/tenant` | Form | M4.6 |
| 55 | Conversões | `/app/settings/conversoes` | Empilhada + Form | M4.6 |
| 56 | Meta Ads (ajustes) | `/app/settings/meta-ads` | Form | M4.6 |
| 57 | Marca | `/app/settings/marca` | Form com prévia | M4.6 |
| 58 | Billing | `/app/settings/billing` | Cartão; o pagamento abre página externa | M4.6 |
| 59 | LGPD | `/app/lgpd/requests` | Empilhada | M4.6 |
| 60 | API Tokens | `/app/settings/api-tokens` | Empilhada + Form | M4.6 |
| 61 | Trunk SIP | `/app/settings/voip-trunk` | Form | M4.6 |
| 62 | Extensões | `/app/extensions` | Seg + Cartão | M4.6 |
| 63 | Dados externos | `/app/integracao-dados` | Form + Cartão | M4.6 |

Fora do catálogo, com tela própria: ficha `/app/leads/[id]` (M2.4 reaproveita a ficha), quadro
`/app/pipelines/[id]` (M3.1) e os detalhes `[id]` de contatos e agentes (M4.7).

Varredura das rotas (página, `_components` e componentes importados de `@/components`): tabela em 21 telas,
diálogo ou gaveta em 21, abas em 8, grade de várias colunas em 33, gráfico em 2 (de 63). É a origem da escolha entre
Empilhada, Form, Seg e Cartão acima.
