---
impacto: capacidade_nova
secao: adicionado
titulo: Publicar outro serviço no mesmo VPS sem editar o Caddyfile
---

Quem roda o CRM neste servidor e quer publicar mais um site — uma wiki, uma landing page, um n8n — precisava acrescentar um bloco no `Caddyfile`. Como o `Caddyfile` é versionado e entra no contêiner por bind mount, essa edição fazia a atualização parar em "parece haver mudanças locais que divergem", e quem atualizava pela tela nem descobria o motivo.

Agora existe um ponto de extensão, nas DUAS variantes (normal e single-server): os dois `Caddyfile` terminam com um `import /etc/caddy/sites/*.caddy`, e os dois composes montam a pasta local `./caddy-sites/` em `/etc/caddy/sites`, somente-leitura. Basta soltar um arquivo `.caddy` na pasta e recarregar o proxy — `docker compose -f docker-compose.prod.yml restart caddy`. Exemplo comentado em `caddy-sites/README.caddy` e no README do kit.

A pasta está no `.gitignore`, menos o placeholder comentado: seus arquivos nunca entram em `git diff` nem atrapalham o `update.sh`, e a pasta existe no clone novo. O que já estava publicado não muda — o adaptador do Caddy devolve a MESMA configuração de antes enquanto a pasta estiver vazia (medido contra o `origin/main`).

Você não precisa fazer nada.
