---
impacto: capacidade_nova
secao: adicionado
titulo: Pedido da Nuvemshop passa a aparecer no histórico do contato
---

Quando chega um pedido da Nuvemshop, o CRM procura entre os seus contatos quem fez a
compra, primeiro pelo telefone (com ou sem o 9, com ou sem o código do país) e depois
pelo e-mail. Achando um único contato, o pedido fica ligado a ele e passa a aparecer
nos pedidos do contato. Nenhum contato novo é criado: se o comprador ainda não está na
sua base, ou se dois contatos têm o mesmo telefone ou e-mail, o pedido fica sem
contato até a próxima atualização dele. Telefone e e-mail do comprador servem só para
essa busca e não são guardados no pedido.

<!-- Risco conhecido: sem FK composta (organization_id, contact_id) em orders; o isolamento por org depende do filtro do handler. -->
