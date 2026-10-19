---
impacto: capacidade_nova
secao: adicionado
titulo: Dados externos passa a aceitar conexões MySQL pela API
---

Quem cria conexões de Dados externos pela API pode agora informar `db_type: "mysql"`, além de `postgres`, e o assistente passa a consultar também bancos MySQL (por exemplo, o de um site WordPress). A leitura é sempre somente leitura: cada consulta roda numa transação só de leitura, com tempo máximo, e o teste da conexão avisa quando o usuário do banco pode escrever ou ler o banco inteiro. A tela ainda não oferece a escolha do motor; ela chega numa próxima atualização. A atualização instala a biblioteca `mysql2`, não acrescenta tabela nem coluna e não exige nenhuma ação de quem opera a instalação.

Desenho e código de @paulolimajr77 (Spec 23, fatia 4a-2a, #2638).
