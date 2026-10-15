---
impacto: nada_mudou
secao: corrigido
titulo: Atrás do túnel da Cloudflare, o endereço de quem acessa passa a ser lido do cabeçalho que a Cloudflare escreve
---

Na instalação com o Cloudflare Tunnel (`docker-compose.cloudflared.yml`), a borda da Cloudflare acrescenta ao `x-forwarded-for` que recebe, em vez de substituí-lo como o Caddy do kit faz. O app lia o primeiro endereço dessa lista, que ali não é necessariamente o de quem acessa. O override do túnel agora declara `IP_DO_CLIENTE_HEADER=cf-connecting-ip` no `app`, e `ipDoCliente` passa a usar esse cabeçalho quando a variável existe e o valor é um IP. Sem a variável (Caddy, Traefik, Nginx), nada muda. As leituras de endereço espalhadas pelas actions, pela trava de tentativas de login e pelas rotas de captura passam todas pela mesma função, e uma cerca reprova leitura nova fora dela. Quem usa o túnel recebe a variável pelo próprio override na atualização; não há arquivo para editar.
