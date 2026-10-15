---
impacto: nada_mudou
secao: corrigido
titulo: A instalação nova deixa de construir o CRM na VPS quando o registro de imagens não responde
---

Quando a instalação não conseguia subir o CRM com as imagens prontas, ela passava a construí-las na própria VPS em qualquer caso, inclusive com o registro de imagens fora do ar. Essa construção gasta a memória da máquina e podia derrubar o resto da VPS junto, o mesmo defeito que a atualização já evitava desde a #1955. Agora a instalação faz a mesma conferência da atualização: se o registro responde (por exemplo, numa VPS de arquitetura diferente da das imagens publicadas), ela continua construindo aqui, como antes; se o registro não responde, ela para com uma mensagem que diz o que aconteceu, pede para rodar o instalador de novo em alguns minutos e mostra como construir de propósito com `DESKCOMM_BUILD_LOCAL=1`. Quem já tem o CRM instalado não precisa fazer nada ao atualizar.

Contribuição de @webtecnica (#2644, fecha #2631).
