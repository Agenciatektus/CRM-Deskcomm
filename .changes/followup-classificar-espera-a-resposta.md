---
impacto: nada_mudou
secao: corrigido
titulo: O passo "Classificar resposta" dos fluxos de follow-up espera o cliente responder
---

Num fluxo que manda uma mensagem e em seguida classifica a resposta com a IA, o
passo de classificar seguia pela saída "Sem resposta" poucos segundos depois do
envio, sem dar ao cliente o tempo de espera configurado no passo (15 minutos
por padrão, ou o prazo que você escolheu). O cliente que respondia dentro desse
prazo já tinha sido tratado como quem não respondeu.

Agora o passo espera. Se o cliente responder dentro do prazo, a resposta é
classificada e o fluxo segue pelo caminho da classe; se o prazo acabar sem
resposta, o fluxo segue por "Sem resposta", como a tela sempre prometeu.

Quem colocou um passo "Aguardar" antes do "Classificar resposta" para contornar
o problema vai notar que agora os dois tempos se somam. Não é preciso mudar
nada, mas vale revisar se a espera extra ainda faz sentido.
