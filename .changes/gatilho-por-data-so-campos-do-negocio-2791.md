---
impacto: nada_mudou
secao: corrigido
titulo: O gatilho "faltam N dias para uma data do funil" não oferece mais campo do contato, que nunca disparava
---

Depois que os campos do funil passaram a poder ser do contato, um campo de data marcado como Contato (ex.: Nascimento) aparecia como opção de "Campo de data" no editor de regras e no Designer de automações. A varredura diária lê a data no negócio, e o valor de um campo do contato fica gravado no contato: a regra era salva e nunca disparava, sem aviso. Agora os dois seletores (e o calendário do funil) oferecem só campos de data do negócio, e o servidor recusa salvar, pela tela ou pela API, uma regra desse gatilho apontada para um campo do contato, com a frase "Este campo de data é do contato, e o gatilho por data só lê campos do negócio. Escolha um campo de data do negócio." Uma regra antiga que já estivesse assim continua sem disparar, como antes; ao ser religada ou ter o gatilho editado, a mesma frase aparece. Desligar ou renomear segue liberado.

Achado na prova do #2852 de @webtecnica (refs #2791).
