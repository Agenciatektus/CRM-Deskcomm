---
impacto: nada_mudou
secao: corrigido
titulo: O passo manual dos e-mails de acesso deixa de mandar quem tem o Supabase na VPS ao painel da nuvem
---

Quando o `marca-emails.sh` não consegue gravar sozinho os modelos dos e-mails de acesso, ele ensina o passo manual. Esse texto mandava todo mundo ao painel do Supabase na nuvem, onde o projeto de quem tem o Supabase na própria VPS não existe. Agora o texto segue a topologia, pela mesma régua do aviso do Site URL do `update.sh`: no Supabase do kit, aponta o `update.sh` e o `.env` do Supabase desta VPS (`.runtime/supabase/.env`), com o comando que recria o auth de dentro dessa pasta; num Supabase próprio, aponta o `.env` dele; na nuvem, o texto segue igual. Só muda o que é impresso; nenhum comando novo roda.

Contribuição de @webtecnica (#2880).
