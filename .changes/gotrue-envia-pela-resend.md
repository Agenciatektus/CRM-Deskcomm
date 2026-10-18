---
impacto: capacidade_nova
secao: corrigido
titulo: No servidor único, o cadastro por convite volta a funcionar quando o e-mail é só pela Resend
---

Na instalação de servidor único (o Supabase que o instalador sobe na própria VPS), o serviço de login só sabia mandar e-mail pelo SMTP configurado no CRM. Quem configurou o e-mail apenas com a chave da Resend tinha o convite entregue — quem envia o convite é o CRM —, mas a pessoa convidada não conseguia criar a conta: o login tentava mandar o e-mail de confirmação para um servidor que não existe, e a tela dizia "Não foi possível criar a conta. Tente novamente.", o que nunca funcionava. Agora, sem SMTP configurado, o serviço de login passa a enviar pela mesma Resend do CRM (a chave e o remetente da tela E-mail, ou do arquivo de instalação), e "esqueci a senha" também volta a sair. Basta atualizar: a própria atualização leva a Resend ao serviço de login, sem editar nada à mão.

E, quando o e-mail de confirmação não puder sair por falta de e-mail configurado, a tela de cadastro deixa de mandar tentar de novo: diz que o envio de e-mails da instalação não está configurado e pede para avisar quem convidou (ou quem administra o sistema).
