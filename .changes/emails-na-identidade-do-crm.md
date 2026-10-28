---
impacto: capacidade_nova
secao: alterado
titulo: E-mails do CRM no visual do produto e convite de compra com 7 dias
---

Os e-mails de convite, confirmação de cadastro, redefinição de senha e troca
de e-mail passam a sair no visual escuro do CRM, com o símbolo no topo. O
convite de quem acabou de comprar pelo link de pagamento ganhou texto próprio
("Sua empresa está pronta", com os passos de entrada) e vale 7 dias; os demais
convites seguem valendo 24 horas.

Instalação com Supabase próprio: o modelo de troca de e-mail agora também é
ligado ao Auth (`GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE`). Sem isso, a troca de
e-mail continua saindo no texto padrão do GoTrue.
