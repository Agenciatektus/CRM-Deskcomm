---
impacto: capacidade_nova
secao: adicionado
titulo: Botão "Ressincronizar webhook" nas redes sociais depois de trocar o domínio
---

Quem trocava o domínio da instalação continuava recebendo as mensagens das redes sociais no endereço antigo, e a conexão seguia aparecendo como ativa. A única saída pela tela era desconectar a conta, o que arquivava o canal e desligava os agentes publicados nele. Agora cada conta conectada em Conexões › Redes sociais tem o botão "Ressincronizar webhook", que aponta a assinatura para o domínio atual sem arquivar o canal nem mexer nos agentes. Se o provedor tinha desligado a assinatura por causa das entregas que falharam no endereço antigo, ela volta a ser ligada junto com a troca. Se a assinatura já está no domínio atual, nada é alterado. Se o provedor não confirmar o endereço novo, a tela avisa o erro em vez de dizer que deu certo.

Contribuição de @webtecnica (#2867), a partir da issue #2863.
