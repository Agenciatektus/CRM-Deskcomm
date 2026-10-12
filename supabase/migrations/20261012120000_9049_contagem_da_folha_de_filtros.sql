-- 9049: a contagem com os filtros da folha do celular (M2.2 do app de celular).
--
-- A folha de filtros mostra "Ver N conversas": o número da aba com TODOS os filtros
-- ligados, que tem de bater com a lista. Faltavam dois, que a lista já aplica:
--
--   * TIPO DE CANAL (WhatsApp, Instagram, Facebook): a lista ganha `canal=`, que vira
--     `conversations.channel = <tipo>`. É a coluna da PRÓPRIA conversa (CHECK em
--     whatsapp, instagram, facebook), então não há lista de sessões a resolver nem
--     sessão de outra organização a vazar: a linha já é da organização filtrada. A
--     rota valida o valor contra a lista fixa antes; aqui, valor de fora não casa.
--   * SÓ GRUPOS: o `is_group` que a lista já filtrava e o badge ignorava (o número
--     da aba era maior que a lista com "Só grupos" ligado).
--
-- A função continua SECURITY INVOKER (a RLS de quem chama decide), sem EXECUTE para
-- anon/public, e a assinatura de 9 parâmetros cai antes da nova (11), porque com as
-- duas de pé a chamada por nome da rota seria ambígua.
--
-- Prova: tests/invariants/contagem-da-folha-9049.test.ts (isolamento entre
-- organizações, escopo do agent, os dois filtros e o controle negativo).
--
-- Leitura: o filtro é uma igualdade a mais na mesma varredura por organização
-- (`idx_conversations_org_last_msg` e afins); não muda o plano. Medir na maior org
-- antes do merge: `explain (analyze, buffers)` da chamada, só leitura.

drop function if exists public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text);
-- Desde a 9049 a função tem 11 parâmetros (`p_canal_tipo` e `p_so_grupos`, a folha
-- de filtros do celular): a de 9 cai antes, pelo mesmo motivo da de 8.
drop function if exists public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean);

create or replace function public.fn_contagens_da_caixa(
  p_organizacao uuid,
  p_comandos_da_fila text[],
  p_terminais text[],
  p_canal uuid default null,
  p_entrada text default null,
  p_so_nao_lidas boolean default false,
  p_marcadores text[] default null,
  p_modo text default 'e',
  p_sem_passo boolean default false,
  p_canal_tipo text default null,
  p_so_grupos boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as materialized (
    select c.status,
           c.assigned_to_user_id,
           public.fn_comando_da_conversa(
             c.status, c.assigned_to_user_id, c.bot_silenced_until,
             coalesce(ct.force_human, false), coalesce(ct.is_blocked, false),
             now(), coalesce(c.is_group, false)
           ) as comando
      from public.conversations c
      left join public.contacts ct
        on ct.id = c.contact_id and ct.organization_id = c.organization_id
     where c.organization_id = p_organizacao
       and (p_canal is null or c.channel_session_id = p_canal)
       and (p_entrada is null or c.instagram_entrada = p_entrada)
       and (
         not coalesce(p_so_nao_lidas, false)
         or c.unread_count_for_assignee > 0
         -- 9042: a conversa que ESTA pessoa marcou como não lida.
         or exists (
           select 1 from public.conversation_user_state s
            where s.conversation_id = c.id
              and s.user_id = (select auth.uid())
              and s.marked_unread_at is not null
         )
       )
       and (
         coalesce(cardinality(p_marcadores), 0) = 0
         or case
              when p_modo = 'ou' and cardinality(p_marcadores) > 1
                then c.tags && p_marcadores or ct.tags && p_marcadores
              else c.tags @> p_marcadores or ct.tags @> p_marcadores
            end
       )
       -- 9047: o MESMO campo calculado que a lista filtra.
       and (not coalesce(p_sem_passo, false) or public.passo_da_conversa(c) = 'sem_passo')
       -- 9049: o TIPO de canal é a coluna da própria conversa (whatsapp, instagram,
       -- facebook: o CHECK de `conversations.channel`), então não há sessão de outra
       -- organização a resolver: a linha já é da organização filtrada acima. Valor
       -- fora da lista não casa nada (a rota valida antes, contra a lista fixa).
       and (p_canal_tipo is null or c.channel = p_canal_tipo)
       -- 9049: "só grupos", o MESMO filtro `is_group` da lista.
       and (not coalesce(p_so_grupos, false) or coalesce(c.is_group, false))
  )
  select jsonb_build_object(
    'fila',       count(*) filter (where comando = any (p_comandos_da_fila)),
    'automatico', count(*) filter (where comando = 'automatico'),
    'mine',       count(*) filter (where assigned_to_user_id = (select auth.uid())
                                     and not (status::text = any (p_terminais))),
    'all',        count(*),
    'closed',     count(*) filter (where status::text = 'closed'),
    'archived',   count(*) filter (where status::text = 'archived')
  )
  from base;
$$;

comment on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean) is
  'As seis contagens das abas da caixa de entrada numa varredura (migration 9029). SECURITY INVOKER: a RLS de conversations vale para quem chama. As regras (fila, terminais, etiquetas limpas) vêm do TypeScript por parâmetro. Desde a 9042, "só não lidas" inclui a conversa que a pessoa marcou como não lida; desde a 9047, p_sem_passo aplica o filtro "Sem próximo passo" (passo_da_conversa); desde a 9049, p_canal_tipo (conversations.channel) e p_so_grupos (is_group), os filtros da folha do celular.';

revoke execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean) from public, anon;
grant  execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
