---
impacto: capacidade_nova
secao: adicionado
titulo: Pedidos da loja Nuvemshop passam a ser gravados no CRM
---

Cada pedido criado, pago, atualizado ou cancelado na loja Nuvemshop agora é gravado
no CRM, com status, envio, código de rastreio e valor. O pedido é relido na loja a
cada aviso e o estado nunca volta atrás (entregue não vira enviado). Por enquanto
só a gravação: o pedido ainda não é ligado ao contato nem mexe no funil.

Risco conhecido (shortcut): a gravação lê e depois escreve, sem condição em SQL; dois avisos simultâneos do mesmo pedido podem regredir o estado até o próximo aviso.
