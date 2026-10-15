---
impacto: exige_acao
secao: alterado
titulo: O pedido de dados que chega pela Nuvemshop passa a esperar o clique em Aprovar
---

Quando um cliente da loja pede os próprios dados pela Nuvemshop (direito de acesso da LGPD), o CRM cria o pedido e passa a esperar alguém da equipe aprovar. Nada é montado nem enviado ao cliente antes disso. Até esta versão, o arquivo saía sozinho para o e-mail que veio no pedido, e o botão "Aprovar export" não segurava nada.

Na tela do pedido (menu Organização › LGPD), a confirmação de "Aprovar export" mostra agora o nome do titular e o e-mail para onde o arquivo vai, para quem aprova conferir a pessoa antes do envio. O aviso de prazo continua: o pedido parado perto dos 7 dias úteis segue avisando a equipe.

A criação e a mudança de estado dos pedidos de dados passam a acontecer só pelo servidor (pelo webhook da loja, pela aprovação e pelos processos internos). A tela e as permissões de quem administra não mudam.

## Requer atenção

Depois de atualizar, alguém com papel de administrador precisa aprovar cada pedido de dados que chegar pela Nuvemshop em Organização › LGPD. Sem a aprovação, o arquivo não é enviado e o prazo legal de 7 dias úteis corre. Confira também os pedidos que chegaram pouco antes da atualização e ainda aparecem como "Recebido": eles esperam a mesma aprovação.
