---
impacto: nada_mudou
secao: corrigido
titulo: Teste grátis vencido sem pagamento não espera mais a tolerância de 5 a 30 dias
---

A tolerância de D-5 (piso 5, teto 30, padrão 7 dias) continua valendo para quem tem pagamento em jogo: dívida de assinatura com pagamento confirmado no passado segue esperando a compensação do boleto ou do Pix antes de suspender.

O teste grátis que acabou sem nenhum pagamento confirmado passa a receber o aviso final no próprio fim do teste e a ser suspenso 48 horas depois, com a data na mensagem — quem nunca pagou nada não tem boleto pendente de compensação. A mensagem desses avisos agora fala em assinar, e não em esperar um pagamento.

A régua continua medindo isso por `vencida_desde`, que só é igual a `trial_ate` quando o provedor não tem pagamento confirmado; o aviso final continua tendo que ser dado, e as 48 horas depois dele seguem valendo para os dois casos.
