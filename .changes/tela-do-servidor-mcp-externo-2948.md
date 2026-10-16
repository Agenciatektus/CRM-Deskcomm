---
impacto: capacidade_nova
secao: adicionado
titulo: A tela de cadastro do servidor MCP externo, no painel da empresa
---
O endereço e a chave do servidor MCP externo já podiam ser gravados pelo sistema, mas não havia tela nenhuma para isso: quem administrava só conseguia registrar o servidor por fora da interface do produto. Agora existe, em Configurações › Servidor MCP externo, a tela do dono da instalação para cadastrar o endereço e a chave do sistema de fora que a IA da empresa consulta, testar a conexão para ver o que o servidor oferece, e remover o registro quando ele deixa de ser usado. O cadastro passa pelo mesmo guard anti-SSRF dos webhooks: endereço de rede interna, localhost e endereço com segredo colado são recusados na hora de salvar, com o motivo escrito na tela. A chave é gravada cifrada e aparece uma única vez, logo após salvar, e só os quatro últimos caracteres.
