-- 9013 — o Inbox do cliente estava estourando o statement_timeout.
--
-- ─── O relato ──────────────────────────────────────────────────────────────
-- Em 23/09/2026 a atendente comercial do Dr. Paulo mandou print de dois erros
-- na mesma tela: "Erro inesperado. Tente novamente." e "Erro ao carregar
-- conversas." — com as abas mostrando Fila 36, Minhas 15, Todas 161.
--
-- ─── O que estava acontecendo ──────────────────────────────────────────────
-- Não era volume, não era a VPS e não era o pool de conexões: tudo isso foi
-- medido e estava saudável. Era o campo COMPUTADO `comando_da_conversa`.
--
-- Ele roda uma vez POR LINHA, na página E na contagem, e o Inbox tem quatro
-- abas que contam separado. O corpo fazia DUAS subconsultas ao MESMO contato,
-- e cada uma passava pela RLS de `contacts`.
--
--   só a RLS de conversations ....   449 buffers
--   com a função (antes) ......... 7.914 buffers,  730 ms  ← 609× a tabela
--   com a função (depois) ........ 3.547 buffers,  260 ms
--
-- O `statement_timeout` de `authenticated` é 8s, e o `pg_stat_statements`
-- registrava 11 queries de `conversations` com máximo acima de 7s. Quando
-- estoura, o PostgREST devolve erro e a tela mostra exatamente o que ela viu.
--
-- ─── Por que um `left join` conserta ───────────────────────────────────────
-- Duas subconsultas ao mesmo contato viram um acesso só. A regra não muda:
-- quem decide continua sendo `fn_comando_da_conversa`, com os mesmos seis
-- argumentos.
--
-- EQUIVALÊNCIA PROVADA antes de aplicar em produção: as duas versões foram
-- comparadas linha a linha nas 168 conversas reais com `is distinct from`, e
-- deram ZERO divergências.
--
-- `left join` e não `join`: `contact_id` é anulável, e contato ausente não
-- pode derrubar a linha para fora de todo filtro — seria uma conversa
-- invisível em TODAS as abas. `contacts.id` é PK, então casa no máximo uma.
--
-- O que NÃO foi feito: `security definer` para pular a RLS de `contacts`.
-- Seria mais rápido e abriria uma porta — a função é exposta pelo PostgREST e
-- passaria a ler contato que o chamador não pode ver.

create or replace function public.comando_da_conversa(c public.conversations)
returns text
language sql
stable
set search_path = public
as $comando$
  -- UM acesso ao contato, não dois.
  --
  -- Esta função é campo COMPUTADO do PostgREST: roda uma vez POR LINHA, na
  -- página E na contagem, e o Inbox tem quatro abas que contam separado. A
  -- versão anterior fazia DUAS subconsultas ao MESMO contato (`force_human` e
  -- `is_blocked`), e cada uma passava pela RLS de `contacts`.
  --
  -- Medido na produção do Dr. Paulo, 168 conversas numa tabela de 13 buffers:
  --
  --   só a RLS de conversations ....   449 buffers
  --   com esta função (antes) ...... 7.914 buffers,  730 ms
  --   com esta função (depois) ..... 3.547 buffers,  260 ms
  --
  -- O `statement_timeout` de `authenticated` é 8s, e 11 queries de
  -- `conversations` já tinham máximo acima de 7s no `pg_stat_statements`.
  -- Quando estoura, o PostgREST devolve erro e a atendente vê "Erro ao carregar
  -- conversas" — foi o que o cliente relatou em 23/09.
  --
  -- EQUIVALÊNCIA PROVADA antes de aplicar: comparadas linha a linha nas 168
  -- conversas de produção com `is distinct from` — zero divergências.
  --
  -- `left join` e não `join`: `contact_id` é anulável, e contato ausente não
  -- pode derrubar a linha para fora de todo filtro — o efeito seria uma
  -- conversa invisível em TODAS as abas. `contacts.id` é chave primária, então
  -- o join casa no máximo uma linha e a função devolve um valor só.
  --
  -- O que NÃO foi feito, de propósito: `security definer` para pular a RLS de
  -- `contacts`. Seria mais rápido e abriria uma porta — esta função é exposta
  -- pelo PostgREST e passaria a ler contato que o chamador não pode ver.
  select public.fn_comando_da_conversa(
    c.status,
    c.assigned_to_user_id,
    c.bot_silenced_until,
    coalesce(ct.force_human, false),
    coalesce(ct.is_blocked, false),
    now()
  )
  from (select 1) as _
  left join public.contacts ct on ct.id = c.contact_id
$comando$;

notify pgrst, 'reload schema';
