---
impacto: capacidade_nova
secao: adicionado
titulo: Os avisos com o app fechado passam a funcionar sem configurar nada, porque a instalação e a atualização criam o par de chaves uma única vez
---
Até aqui, receber os avisos do sistema com a aba ou o app fechado exigia que quem administra o servidor gerasse um par de chaves (VAPID) à mão e o colasse no `.env`. Agora a instalação cria esse par sozinha, e a atualização cria para quem já tinha instalado, sem nenhuma edição. O par nasce uma única vez e nunca é trocado depois, porque trocar desligaria os avisos de todo aparelho já inscrito.

- Se o `.env` já tem as duas chaves, nada muda.
- Se tem só uma delas, a atualização não mexe no par e avisa: apague as duas linhas e rode `bash hostgator-setup-kit/update.sh` para o kit criar um par novo. A atualização cria o par mesmo quando não há versão nova.
- Se a criação falhar, a atualização segue normal e avisa; para tentar de novo, rode `bash hostgator-setup-kit/update.sh`.
- Servidor montado sem o kit de instalação continua gerando o par à mão (`npx web-push generate-vapid-keys`), como a tela de Notificações explica.
- O backup não leva o `.env`. Ao restaurar numa VPS nova, leve o `.env` junto para manter o par; sem ele, nasce um par novo, e cada aparelho refaz a própria inscrição na próxima vez que abrir o sistema.
