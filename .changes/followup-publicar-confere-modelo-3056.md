---
impacto: nada_mudou
secao: corrigido
titulo: Publicar um fluxo de follow-up confere se o modelo de mensagem existe nesta conta
---

Um fluxo cujo passo de mensagem apontava para um modelo que não existe nesta conta (importado de outra conta, ou com o modelo apagado depois) era publicado, e cada envio desse passo falhava. Agora o Publicar recusa, destacando o passo com «Escolha um modelo de mensagem: o que estava aqui não existe nesta conta.» — vale para o modelo do passo e para o modelo aprovado do plano B da mensagem por IA. No editor, esse passo mostra «Escolha um modelo» e um aviso, em vez de um seletor em branco. Achado na prova do #3056 de @salomaobatistamkt.
