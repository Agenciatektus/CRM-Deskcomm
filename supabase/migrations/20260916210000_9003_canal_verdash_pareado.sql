-- 9003_canal_verdash_pareado
--
-- O canal Verdash passa a ter DOIS modos de transporte, e esta coluna é o que
-- os distingue.
--
-- ─── Por que dois modos ─────────────────────────────────────────────────────
--
-- Modo DIRETO (o da 9001): `verdash_token_encrypted` guarda o token da
-- instância no FZAP, e o CRM fala direto com ele. Funciona, e é como o primeiro
-- número entrou no ar — mas tem um defeito que não se resolve com cuidado
-- operacional: o token vive em dois sistemas, e revogar o acesso do CRM exige
-- rotacionar o token no FZAP, o que derruba a Verdash junto.
--
-- Modo PAREADO: o cliente cola um CÓDIGO, a Verdash devolve um token DELA com
-- escopo de uma instância, e o envio passa por lá. O token do FZAP nunca sai da
-- Verdash; revogar é um clique na tela dela. E o número oficial da Meta passa a
-- funcionar pelo mesmo botão, porque quem roteia entre Cloud API e FZAP é a
-- Verdash.
--
-- ─── Por que uma coluna, e não adivinhar pelo formato do token ──────────────
--
-- Os dois tokens são strings hexadecimais e um palpite pelo TAMANHO funcionaria
-- hoje e quebraria no dia em que um dos lados mudasse o tamanho — em silêncio,
-- mandando a mensagem pelo transporte errado. `verdash_vinculo_id` presente
-- significa "pareado"; ausente significa "direto". É uma pergunta que o dado
-- responde, não o formato.
--
-- A coluna guarda o id do vínculo NA VERDASH, que é o que a tela de lá usa para
-- revogar — então ele também serve para o suporte casar os dois lados quando
-- alguém perguntar "quem está conectado nessa linha?".

alter table public.channel_sessions
  add column if not exists verdash_vinculo_id text;

comment on column public.channel_sessions.verdash_vinculo_id is
  'Id do vínculo na Verdash quando o canal foi conectado por CÓDIGO DE PAREAMENTO. Presente = envio passa pela Verdash (o token guardado é de máquina, com escopo de uma instância); ausente = envio direto ao FZAP com o token da instância.';
