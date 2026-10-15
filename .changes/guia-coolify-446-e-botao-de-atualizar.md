---
impacto: nada_mudou
secao: corrigido
titulo: O guia do Coolify instala a versão atual do Coolify e já mostra a atualização pelo botão da tela
---

O comando do guia fixava o Coolify na 4.3.23. O instalador que o site do Coolify entrega é sempre o mais novo e, desde a 4.4, junta essa imagem antiga com a configuração nova. Medido em 14/10/2026, o painel terminava "not healthy" e o servidor não se conectava. O comando agora não leva número de versão. As telas e as capturas do guia foram refeitas na 4.4.6: registro com a regra de senha nova, a caixa da porta 22022 e a tela "Project Setup" com o Skip setup. A seção "Atualizar" ganhou a medição do botão **Atualizar agora**, de 1.79.0 para 1.80.0 atrás do Coolify: o pedido é pego em até 5 minutos, o site fica cerca de 30 s fora do ar, e a porta do banco e a rede do proxy ficam como estavam. As conferências de "está no ar" passam a usar `/app` (`307`), porque a raiz do domínio virou página pública e responde `200`. Provas em `evidence/2026-10-14-coolify-446-e-botao/`.
