---
impacto: nada_mudou
secao: corrigido
titulo: O custo das chamadas do provedor personalizado passa a ser calculado pelo preço do catálogo
---

O provedor personalizado serve qualquer modelo — o endereço é de quem instalou —, e o motor de custo só olhava a tabela de preços embutida no código. Um modelo que não estivesse lá, como o `openai/gpt-oss-120b` apontado para o Groq, gravava `llm_calls.cost_cents` nulo em toda chamada: a tela de Uso e orçamento somava `coalesce(cost_cents, 0)`, então essas chamadas pagas apareciam como gasto zero e não consumiam teto nenhum. Medido numa instalação: 180 chamadas de `openai/gpt-oss-120b` e 256 de `openai/gpt-oss-20b`, todas nulas, enquanto o Haiku 5.5 do mesmo turno tinha custo.

Agora, quando a tabela embutida não conhece o id, o preço sai do catálogo da própria instalação — as tabelas `ai_models` e `ai_pricing`, as mesmas que a tela de Provedores mostra e que a tela de orçamento já usava nos outros caminhos de custo. É de lá que sai o preço do modelo que você cadastrou, sem nenhum número inventado no código: modelo que não está em nenhuma das duas continua sem custo, e agora isso deixa aviso no log uma vez por provedor e modelo, em vez de passar calado.

Quem só usa os modelos de fábrica não vê mudança nenhuma: a tabela embutida continua sendo consultada primeiro, e para eles nada mais é lido do banco.

Refs #3013.
