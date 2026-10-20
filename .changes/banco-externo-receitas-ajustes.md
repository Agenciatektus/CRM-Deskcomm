---
impacto: nada_mudou
secao: corrigido
titulo: Receitas prontas: salvar sem editar, produto só com preço regular e cartão no celular
---

Três correções na tela de receitas prontas (Integração de dados › conexão MySQL):

1. "Adicionar receita" + "Salvar" sem editar não dá mais 422 "Campos inválidos": o rascunho nasce com descrição vazia (o cartão já exibia `inst.descricao || receita.descricao`, nada some da tela). Quando o salvar recebe 422, o toast agora diz qual campo falhou e por quê.
2. A busca de produtos da WooCommerce usa `left join` em `_price`: um produto que só tem `_regular_price` não some mais dos resultados e aparece com o preço certo. Produto sem preço nenhum continua de fora do filtro de preço máximo (`NULL <= x` é falso no MySQL).
3. O cartão de receita cabe em telas estreitas (390px): a linha de fora e a linha de ações quebram, e a descrição não transborda. A prévia agora diz "1 linha" / "N linhas" no singular correto.

Nada a fazer na atualização.
