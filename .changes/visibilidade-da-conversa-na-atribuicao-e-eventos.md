---
impacto: nada_mudou
secao: corrigido
titulo: A visibilidade de cada conversa vale também na atribuição e no registro de eventos
---

Assumir ou transferir uma conversa que o atendente não enxerga agora responde como uma conversa que não existe. No registro interno de eventos, o evento ligado a uma conversa passa a seguir a mesma regra de quem pode ver a conversa (o modo de visibilidade em Configurações › Atendimento); a conversa do evento é resolvida pelo entity_id (conversation/conversation_note), por payload.conversation_id, ou pelo ref_id do aviso da Central. Gestores e administradores continuam vendo todos; evento sem conversa resolvível segue só o pertencimento à organização, como antes. A atualização aplica a mudança de banco sozinha; nada a fazer.
