---
impacto: capacidade_nova
secao: adicionado
titulo: Automação que cria um card em outro funil sem mexer no card de origem
---

Nas Automações há uma ação nova, "Criar card em outro funil". Ela serve para quem
trabalha com funis em sequência, como Vendas, Pós-venda e Recompra: quando o card de
Vendas entra na etapa "Pago", nasce um card novo no Pós-venda, na etapa que você
escolher, para o mesmo contato. O card de Vendas fica onde está, ganho, e continua
contando na receita.

Você decide se o card novo leva o valor e o responsável do card de origem. A ação
não cria card repetido: se o contato já tem um card aberto no funil de destino, ou
se aquela automação já criou o card para aquele negócio, nada novo é criado. Os dois
cards registram na linha do tempo de onde um veio e para onde o outro foi.

Um detalhe para quem monta regras em cadeia: o card criado por esta ação não dispara
as automações de "quando um lead for criado" do funil de destino. As mudanças de etapa
que a equipe fizer nele depois disparam normalmente.
