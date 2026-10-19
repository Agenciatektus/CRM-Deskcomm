-- manifest: 9034 — `campaigns.message_variants` (text[], até 5, 1.000 chars cada): a campanha ganha as variações de mensagem e o spintax `{a|b}` que hoje só a cadência tem. Por quê: 500 pessoas recebendo o MESMO texto do MESMO número na mesma tarde é o padrão que o WhatsApp mede; a variação quebra o padrão com textos que o operador escreveu. Coluna EXTRA (a lista efetiva é `[message_body, ...message_variants]`), para campanha existente não mudar de comportamento e o CHECK de `message_body` não-vazio seguir valendo.
--
-- 9034 — A CAMPANHA GANHA VARIAÇÕES DE MENSAGEM (e o spintax `{a|b}`)
--
-- ## ANTES DO DEPLOY: contar o corpo legado que passa a ser lido como sintaxe
--
-- Esta mudança faz `{` e `}` deixarem de ser caracteres comuns no
-- `message_body` e virarem sintaxe. Campanha escrita antes dela pode conter
-- chave sem essa intenção, e o efeito se divide em dois:
--
--   "Horario {09h as 18h}"   -> vira "Horario 09h as 18h": as chaves somem, em
--                               SILENCIO, e o cliente recebe texto diferente
--   "Oi {nome}, tudo bem? :}" -> BLOQUEADO na preparacao com erro de spintax.
--                               Fail-closed, mas trava envio que ontem saia
--
-- Rode ANTES de aplicar, e decida caso a caso se vier linha:
--
--   select id, name, status, message_body
--   from public.campaigns
--   where message_body ~ '[{}]';
--
-- Medido na instalacao da Tektus em 05/10/2026: 1 campanha no total, 1 com
-- chave -- e a chave e `{{primeiro_nome}}`, variavel legitima, nao spintax.
-- Zero campanhas em risco. Numa instalacao com historico o resultado pode ser
-- outro: a contagem e obrigatoria, nao ilustrativa.
--
-- ## Por quê
--
-- Quinhentas pessoas recebendo o texto IDÊNTICO, do mesmo número, na mesma
-- tarde, é o padrão que o WhatsApp mede — e a cadência (migration 0318) já
-- resolve isso com N variações por passo e `{a|b}`. A campanha não tinha nada:
-- uma coluna de texto e pronto. O motor é o MESMO (`lib/texto/variacao.ts`,
-- usado pelas duas), então aqui não nasce régua concorrente: nasce a coluna.
--
-- ## Por que coluna EXTRA, e não uma coluna de lista substituindo `message_body`
--
-- Trocar `message_body text` por `message_variants text[]` exigiria migrar dado
-- (toda campanha existente), reescrever o CHECK de não-vazio, a prévia, o
-- congelamento em `campaign_recipients.rendered_body` e o duplicar — para
-- guardar a MESMA informação. Com a coluna extra, a lista efetiva é
-- `[message_body, ...message_variants]`: campanha que nunca abriu a seção tem
-- lista de um item, `escolherVariante` devolve 0 sem hash nenhum, e o
-- comportamento é byte-a-byte o de antes.
--
-- ## Os tetos, e por que um deles é função
--
-- Cinco variações extras e 1.000 caracteres cada (o mesmo teto por variante da
-- cadência, `VARIANTE_TAMANHO_MAXIMO`). O teto POR ELEMENTO não cabe num CHECK
-- escrito à mão: `check` não aceita subconsulta, e é por isso que a 0329
-- (mensagem por lembrete) já resolveu o mesmo problema com uma função
-- `immutable` — mesmo molde aqui. O corpo principal segue com o teto de 4.096
-- da coluna dele: o Zod da rota não o corta, e cortar aqui mutilaria em
-- silêncio a campanha longa que já existe.
--
-- ## Quem escreve
--
-- `authenticated` só tem SELECT em `campaigns` (0375); quem escreve é o servidor
-- com o cliente admin, atrás do Zod de `lib/campanhas/schemas.ts`. O CHECK é a
-- segunda tranca, para o INSERT direto pela PostgREST com service_role também
-- parar nela.
--
-- ## Escolha determinística, e o que vai para o snapshot
--
-- A variante sai do `contact_id` (`escolherVariante`): a mesma pessoa recebe a
-- mesma variação, inclusive ao repreparar — semente por campanha faria a lista
-- inteira trocar de texto a cada clique em Preparar. Qual saiu fica em
-- `campaign_recipients.variables.variante_index`, que é jsonb livre e não pede
-- migration.

set local lock_timeout = '3s';

-- Teto por elemento e cardinalidade numa função `immutable`, porque `check` não
-- aceita subconsulta (molde da 0329 / `fn_corpos_de_lembrete_validos`).
create or replace function public.fn_variacoes_da_campanha_validas(p_variacoes text[])
returns boolean
language sql
immutable
as $$
  select p_variacoes is not null
     and coalesce(cardinality(p_variacoes), 0) <= 5
     and coalesce((
       select bool_and(t.v is not null and length(t.v) <= 1000)
       from unnest(p_variacoes) as t(v)
     ), true);
$$;

revoke execute on function public.fn_variacoes_da_campanha_validas(text[]) from public, anon;
grant execute on function public.fn_variacoes_da_campanha_validas(text[]) to authenticated, service_role;

alter table public.campaigns
  add column if not exists message_variants text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaigns_variacoes_validas'
       and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_variacoes_validas
      check (public.fn_variacoes_da_campanha_validas(message_variants));
  end if;
end $$;

comment on column public.campaigns.message_variants is
  'Variações EXTRAS da abordagem. A lista efetiva é [message_body, ...message_variants] e a escolha é determinística pelo contact_id (lib/texto/variacao.ts). Vazio = campanha de um texto só. Até 5, 1.000 chars cada (campaigns_variacoes_validas). Migration 9034.';

notify pgrst, 'reload schema';
