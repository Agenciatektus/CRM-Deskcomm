---
impacto: nada_mudou
secao: corrigido
titulo: O arquivo de webhooks não enche mais o banco com a mídia das mensagens
---

Cada foto, áudio ou vídeo que chegava pelo WhatsApp era guardado duas vezes no
arquivo de webhooks recebidos, com o arquivo inteiro dentro. Em uma instalação isso
chegou a ocupar quase todo o banco e o derrubou ao passar do limite do plano.

Agora o arquivo guarda só o tamanho da mídia, no lugar do conteúdo, e deixa de
guardar o token da instância que vinha junto no mesmo evento. O segredo que o
WhatsApp manda no cabeçalho de cada entrega, para provar que ela é legítima, também
deixa de ser arquivado. As mensagens e os anexos continuam chegando ao inbox como
antes: eles nunca foram lidos desse arquivo.
