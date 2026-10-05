---
impacto: nada_mudou
secao: corrigido
titulo: O metadata do envio de mensagem pela API aceita só as chaves conhecidas
---

Quem envia mensagem por `POST /api/v1/messages`, pela tela ou por token de
integração, só consegue gravar no `metadata` três chaves: `client_id` (formato
`temp-…`, usado pela tela para casar a bolha do envio), `shared_contact_id` e
`shared_contact` (o cartão de contato, com `name` de até 200 caracteres e
`phone_number`). Qualquer outra chave é descartada sem recusar o envio. Antes,
uma integração conseguia gravar marcas internas do sistema, como a de mensagem
ocultada no CRM.

Limites novos, todos com erro claro em vez de corte silencioso: `metadata` acima
de 8 KB e corpo da requisição acima de 64 KB devolvem 413 (`payload_too_large`).
Nome do cartão de contato acima de 200 caracteres devolve 422.
