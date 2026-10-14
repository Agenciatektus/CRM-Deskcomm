---
impacto: nada_mudou
secao: corrigido
titulo: Aba oculta para de refazer as telas de fluxo a cada 3 segundos
---

A preparação de uma extensão e o pareamento de uma conexão continuavam consultando o servidor a cada 3 segundos com a aba escondida — numa tela de espera em que ninguém está olhando. Agora as duas pausam enquanto a aba está oculta, como já faziam o refetch de segurança do atendimento, a presença, a chamada de voz e os alertas, e voltam a consultar no tick seguinte quando a aba retorna.

Contribuição de @webtecnica (#<n do PR>), a partir do PR #2821.
