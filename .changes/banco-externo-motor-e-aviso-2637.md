---
impacto: capacidade_nova
secao: adicionado
titulo: A conexão de Dados externos passa a guardar o tipo do banco e um espaço para o aviso do último teste
---

Cada conexão de Dados externos passa a guardar qual é o banco do outro lado e ganha um espaço para o aviso do último teste. As conexões que já existem ficam marcadas como PostgreSQL, sem aviso, e nada muda na tela. Se a sua integração lê a lista de conexões pela API, ela passa a ver também os campos `db_type` e `last_test_aviso`; e as ferramentas do assistente que consultam o banco externo passam a dizer o tipo do banco no campo `motor`. A atualização acrescenta duas colunas na tabela de conexões e não exige nenhuma ação de quem opera a instalação.

Desenho e código de @paulolimajr77 (Spec 23, fatia 4a-1, #2637).
