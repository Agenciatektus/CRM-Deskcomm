---
impacto: capacidade_nova
secao: alterado
titulo: A transcrição de áudio usa primeiro a assinatura da própria organização
---

Antes, o áudio do cliente ia primeiro para o serviço de transcrição da instalação.
Quando a chave desse serviço era recusada, a nota de voz ficava sem texto, mesmo em
organizações com Gemini ou GPT válidos.

Agora, se o modelo de conversa da organização entende áudio e usa a credencial da
própria organização, é ele que transcreve, sem custo para a Tektus. Só depois entram
o serviço da instalação e a chave OpenAI. Se um desses recusar a chave, o seguinte
assume na hora, o motivo fica registrado na mensagem e a Central avisa uma vez por dia
que a chave recusada precisa ser trocada.
