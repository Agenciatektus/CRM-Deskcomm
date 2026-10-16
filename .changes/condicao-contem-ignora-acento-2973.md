---
impacto: nada_mudou
secao: corrigido
titulo: A condição "contém" das automações ignora acento e pontuação
---

A condição `contém` das automações comparava sem diferenciar maiúsculas, mas não ignorava acento nem pontuação: uma regra escrita com "anúncio" não disparava para um lead que escreveu "anuncio", e "Olá" não casava "Ola" nem "olá!". A regra simplesmente não rodava, sem erro e sem aviso, e o operador ficava com a impressão de que a automação dispara quando quer. Agora os dois lados da comparação passam pela mesma normalização — minúsculas, sem acento e sem pontuação —, então "Olá", "Ola" e "olá!" são a mesma frase para a regra. A comparação exata (`é igual a`) continua exata, e a pertinência em lista de tags continua exigindo a tag inteira. Nada precisa ser feito na instalação.

Refs #2973.
