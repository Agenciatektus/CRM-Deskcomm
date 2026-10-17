---
impacto: nada_mudou
secao: corrigido
titulo: O gatilho "faltam N dias para uma data do funil" não oferece mais campo do contato, que nunca disparava
---

Depois que os campos do funil passaram a poder ser do contato, um campo de data marcado como Contato (ex.: Nascimento) aparecia como opção de "Campo de data" no editor de regras e no Designer de automações. A varredura diária lê a data no negócio, e o valor de um campo do contato fica gravado no contato: a regra era salva e nunca disparava, sem aviso. Agora os dois seletores oferecem só campos de data do negócio, como o calendário do funil já fazia, e o servidor recusa salvar ou religar, pela tela, pela API ou pelo assistente, uma regra desse gatilho apontada para um campo do contato, com a frase "Este campo de data é do contato, e o gatilho por data só lê campos do negócio. Escolha um campo de data do negócio." Desligar ou renomear segue liberado.

O que ainda não é barrado: uma regra antiga que já estivesse ligada assim continua ligada e sem disparar, e a frase só aparece quando alguém edita o gatilho ou religa a regra. Marcar como Contato, nas configurações do funil, um campo de data que uma regra já usa também não é conferido: a regra continua ligada e deixa de disparar para as datas gravadas depois da mudança. Nesse caso, troque o campo da regra por um campo de data do negócio.

Achado na prova do #2852 de @webtecnica (refs #2791).
