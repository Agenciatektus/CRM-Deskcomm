# Adendo proposto — entrada paga e upgrade proporcional

Este adendo acompanha a PR e propõe uma revisão da decisão D-3 da especificação `2026-09-29-cobranca-do-revendedor-design.md`. A decisão original mantém qualquer troca para o próximo ciclo. A experiência de homologação do revendedor mostrou a necessidade de liberar upgrades no mesmo dia sem cobrar novamente o período inteiro. A decisão final cabe à revisão da PR; até lá, este texto não altera retroativamente a decisão aceita.

## Entrada paga

- No cadastro público, quando a cobrança está ligada, a pessoa pode selecionar um plano oferecido. O identificador escolhido é validado no servidor e novamente pelo gatilho que cria a assinatura.
- Plano com dias de teste positivos mantém o período de teste existente.
- Plano com zero dias de teste cria a assinatura como pendente e suspende a organização até o provedor confirmar o primeiro pagamento. A tolerância de renovação não abre o acesso inicial.
- Organizações sem assinatura continuam isentas; o comportamento só vale quando a cobrança está ligada e há plano de cadastro válido.

## Troca de plano

- Upgrade durante período pago: calcular `round((preço_novo - preço_atual) × fração_restante_do_período)`, emitir cobrança avulsa pelo provedor e manter preço e limites atuais até a confirmação.
- Com confirmação, atualizar o preço recorrente da assinatura existente e aplicar o plano novo. Preservar o cliente e a âncora de renovação atual.
- Downgrade mantém o plano e os limites atuais até a próxima renovação paga; não há reembolso proporcional nesta entrega.
- Se faltar início/fim confiável do período, recusar o cálculo e manter o plano atual. Nunca estimar o valor a partir da data de criação da organização.
- O painel compara preço, intervalo, assentos, canais e teto mensal de IA antes da confirmação e informa o valor estimado e a data da próxima renovação.

## Questões para revisão

- Confirmar que upgrades devem ser imediatos após compensação da cobrança proporcional (Pix/cartão/boleto), mantendo o vencimento existente.
- Confirmar que downgrade sem crédito proporcional é a política desejada.
- Validar os estados de reconciliação para cobranças pagas após o link expirar ou após cancelamento da assinatura.
