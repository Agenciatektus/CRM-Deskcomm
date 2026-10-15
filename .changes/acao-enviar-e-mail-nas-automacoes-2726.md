---
impacto: capacidade_nova
secao: adicionado
titulo: A automação ganha a ação Enviar e-mail, pelo e-mail que já está configurado
---

As regras de automação ganham uma nova ação, Enviar e-mail. Dentro de um "ENTÃO", ela manda um e-mail para o contato do negócio, para o responsável do negócio ou para um endereço fixo escrito na regra. Assunto e corpo aceitam as mesmas variáveis do WhatsApp ({{nome}}, {{primeiro_nome}} e os campos do funil, como {{destino}}), e o corpo pode sair em texto simples ou em HTML simples.

O envio não tem transporte novo nem credencial nova: ele passa pelo que já está configurado em Admin › E-mail, que escolhe entre o servidor próprio (SMTP) e o serviço externo (Resend). Se nenhuma das duas estiver ligada, a aba Atividade mostra a frase que diz o que falta, e não um sucesso silencioso. O mesmo vale para um contato sem e-mail cadastrado ou com recusa de mensagens registrada: a regra pula, com o motivo na tela.

O responsável do negócio só recebe enquanto fizer parte da equipe. Cada empresa envia até 200 e-mails de automação por hora: passando disso, a regra espera a hora seguinte e envia, sem perder o envio. Um contato sem e-mail, bloqueado ou com recusa registrada não conta para esse limite.

Você não precisa fazer nada. Para usar a nova ação, monte a regra, escolha a ação Enviar e-mail e digite quem recebe.

Contribuição de @webtecnica (#2794), a partir da issue #2726.
