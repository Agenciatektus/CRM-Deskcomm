---
impacto: nada_mudou
secao: corrigido
titulo: A lista do inbox carrega numa busca só — a Fila não pedia a mesma lista duas vezes
---

Ao abrir o inbox, a aba Fila pedia a MESMA lista duas vezes em série: a primeira busca saía antes de a tela saber se a instalação tem atendimento automático de pé, e era descartada assim que essa resposta chegava. O efeito para quem usa era a lista voltando ao esqueleto por cerca de um segundo, pagando duas voltas de rede por uma lista só. Agora a Fila só consulta depois de saber esse fato — sai UMA requisição, com o filtro definitivo — e as outras abas continuam consultando na hora, como antes. A espera aparece como esqueleto de carregamento, nunca como caixa de entrada vazia.

Você não precisa fazer nada.

Contribuição de @webtecnica, a partir do PR #2365 de @melgarafael.
