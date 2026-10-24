---
impacto: nada_mudou
secao: alterado
titulo: Meta (Graph API) passa para a versão v25.0
---

O sistema passa a falar com a Meta na versão v25.0 da Graph API, a mesma que a
Verdash já usa, em vez da v22.0. Vale para métricas de anúncio, envio de
conversões e canais da Meta.

Se a sua instalação define `META_GRAPH_VERSION` no `.env`, essa variável continua
mandando nos canais de mensagem: atualize-a para `v25.0` se quiser a mesma versão
em tudo. A conexão de anúncios sempre usa a versão padrão do sistema.
