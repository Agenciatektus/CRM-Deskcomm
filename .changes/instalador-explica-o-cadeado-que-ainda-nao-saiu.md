---
impacto: nada_mudou
secao: corrigido
titulo: Quando o cadeado do domínio ainda não saiu, o fim da instalação diz isso, e não manda procurar erro no .env
---

Num domínio recém-apontado, o primeiro pedido de certificado ao Let's Encrypt pode falhar, e o certificado sai alguns minutos depois. Medido atrás do Coolify em 14/10/2026: o app não confiou no HTTPS do próprio domínio (`tls_recusado`), e a instalação terminava em "Quase lá — falta o app responder", mandando procurar uma chave errada no `.env`, que estava certo. Agora, com esse motivo, a tela final é "Quase lá — falta o cadeado (HTTPS) do seu domínio". Ela ensina a conferir com `curl -sSI https://SEU_DOMINIO/app | head -1` (o certo é `307`; se o cadeado ainda não saiu, o comando mostra o erro em vez de ficar em branco) e manda rodar de novo o mesmo comando de instalação quando der `307`. Medido: rodar de novo terminou em 21 s, saudável e com as credenciais na tela, sem duplicar o dono. O código de saída continua `1`. O resto da tela "Quase lá" não mudou.
