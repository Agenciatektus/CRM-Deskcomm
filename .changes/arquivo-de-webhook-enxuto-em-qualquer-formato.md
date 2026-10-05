---
impacto: nada_mudou
secao: corrigido
titulo: O arquivo de webhooks volta a não guardar o token da instância nem a mídia inteira
---

A limpeza anterior só reconhecia o token e a mídia quando eles vinham num lugar
fixo do evento. Itens de álbum e outros formatos de entrega escapavam dela, e o
arquivo de webhooks voltou a guardar o token da instância em claro e fotos inteiras
dentro do banco.

Agora a regra vale para qualquer formato: credencial (token, segredo, chave de API)
some onde quer que esteja no evento ou nos cabeçalhos, e qualquer texto muito
grande vira só o tamanho e uma impressão digital do conteúdo. As mensagens e os
anexos continuam chegando ao inbox como antes, porque eles nunca foram lidos desse
arquivo.
