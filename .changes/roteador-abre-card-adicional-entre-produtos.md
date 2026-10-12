---
impacto: capacidade_nova
secao: adicionado
titulo: O roteador abre um segundo card quando o cliente passa a falar de outro produto
---

Quando uma intenção do roteador tem funil de destino, o cliente que já tem um
negócio em outro funil de **produto** (por exemplo Consórcio) e passa a falar de
um segundo produto (por exemplo Investimentos) agora ganha um **segundo card** no
funil do novo produto. O card do primeiro produto continua como está: nada é
encerrado e nada conta como perda. O cliente que já fechou um produto e fala de
outro também ganha o card do novo.

O card que está num funil de entrada (como a Recepção) continua sendo transferido
para o funil do produto, como antes. O card novo leva só o título, o contato e a
origem; etiquetas, campos, valor e responsável do outro produto não são copiados.
Se o cliente já tem card no funil de destino, nenhum card novo é criado. Intenção
sem funil de destino se comporta exatamente como antes.
