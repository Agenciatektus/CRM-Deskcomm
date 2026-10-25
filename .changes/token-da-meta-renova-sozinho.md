---
impacto: nada_mudou
secao: adicionado
titulo: O token da Meta conectado por login se renova sozinho
---

A conexão feita pelo botão Conectar com Meta guardava um token de cerca de 60
dias, e depois disso a leitura dos anúncios parava até alguém reconectar. Agora,
uma vez por dia, o sistema renova por mais 60 dias o token que vence em até 15
dias. Se a renovação falhar, o token antigo continua valendo até o vencimento, e
a tela segue avisando para reconectar quando faltarem menos de 10 dias.
