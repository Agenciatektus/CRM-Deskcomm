-- 9051: os filtros da Inbox por FUNIL, ETAPA, RESPONSÁVEL e PERÍODO (pedido do Peterson).
--
-- O painel "Filtros" só tinha não lidas, sem próximo passo, grupos e tags. Entram:
--
--   * FUNIL e ETAPAS: o negócio do contato da conversa (`crm_leads.contact_id`, a mesma
--     ligação que a ficha usa em `/contacts/[id]/crm-summary`). Dois campos calculados do
--     PostgREST, `funis_da_conversa(c)` e `etapas_da_conversa(c)` (uuid[]), SECURITY
--     INVOKER: a RLS de crm_leads de quem chama decide (o agent em modo own só casa o
--     negócio que ele vê). A lista filtra `etapas_da_conversa=ov.{…}` (várias etapas) ou
--     `funis_da_conversa=cs.{funil}`; a contagem aplica as MESMAS funções. Sem lista de
--     ids na URL. Leitura por `idx_crm_leads_org_contact` (organization_id, contact_id),
--     que já existe: nenhum índice novo.
--   * RESPONSÁVEL: `assigned_to_user_id` (id ou 'ninguem' = sem atendente), já filtrável
--     na lista; a contagem passa a aplicar junto.
--   * PERÍODO da última mensagem: `last_message_at >= p_desde`; o corte é calculado uma
--     vez no TypeScript (24h, 7d, 30d) e é o mesmo valor que a lista usa.
--
-- COMPATIBILIDADE COM O APP ANTIGO: a assinatura de 11 parâmetros cai e a nova tem 15,
-- os 4 novos com DEFAULT. O app em produção chama por NOME com os 11 de hoje; o
-- Postgres (e o PostgREST, que aceita omitir parâmetro com default) resolve essa chamada
-- na função nova, com os filtros novos desligados. Manter as duas de pé deixaria a
-- chamada AMBÍGUA, como nas trocas da 9047 e da 9049. Ordem do deploy: migration ANTES
-- do app (o app novo manda os 15 nomes e falharia contra a função antiga).
--
-- A função continua SECURITY INVOKER, sem EXECUTE para anon/public.
--
-- Prova: tests/invariants/filtros-da-caixa-9051.test.ts (funil e etapa por ator,
-- isolamento entre organizações, responsável, período e controle negativo).

create or replace function public.funis_da_conversa(c public.conversations)
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(distinct l.pipeline_id), '{}'::uuid[])
    from public.crm_leads l
   where l.contact_id = c.contact_id
     and l.organization_id = c.organization_id
$$;

comment on function public.funis_da_conversa(public.conversations) is
  'Campo calculado do PostgREST: os funis em que o contato da conversa tem negócio (qualquer status), pela RLS de crm_leads de quem chama. Filtro "Funil" da Inbox (migration 9051).';

revoke execute on function public.funis_da_conversa(public.conversations) from public, anon;
grant  execute on function public.funis_da_conversa(public.conversations) to authenticated, service_role;

create or replace function public.etapas_da_conversa(c public.conversations)
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(distinct l.stage_id), '{}'::uuid[])
    from public.crm_leads l
   where l.contact_id = c.contact_id
     and l.organization_id = c.organization_id
$$;

comment on function public.etapas_da_conversa(public.conversations) is
  'Campo calculado do PostgREST: as etapas em que estão os negócios do contato da conversa (qualquer status), pela RLS de crm_leads de quem chama. Filtro "Etapa" da Inbox (migration 9051).';

revoke execute on function public.etapas_da_conversa(public.conversations) from public, anon;
grant  execute on function public.etapas_da_conversa(public.conversations) to authenticated, service_role;

drop function if exists public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean);

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
  p_grupos boolean default null,
  p_funil uuid default null,
  p_etapas uuid[] default null,
  p_responsavel text default null,
  p_desde timestamptz default null
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
       -- 9049: o MESMO filtro `is_group` da lista, nos três estados: nulo = todas,
       -- true = só grupos, false = sem grupos (P2 do Cassio na #179).
       and (p_grupos is null or coalesce(c.is_group, false) = p_grupos)
       -- 9051: FUNIL e ETAPAS pelos MESMOS campos calculados que a lista filtra
       -- (`funis_da_conversa`, `etapas_da_conversa`: o negócio do contato da conversa,
       -- com a RLS de crm_leads de quem chama). Etapa escolhida decide sozinha (a
       -- etapa é de um funil só); sem etapa, vale o funil.
       and (
         case
           when coalesce(cardinality(p_etapas), 0) > 0
             then public.etapas_da_conversa(c) && p_etapas
           when p_funil is not null
             then public.funis_da_conversa(c) @> array[p_funil]
           else true
         end
       )
       -- 9051: o RESPONSÁVEL como a lista: 'ninguem' = sem atendente; senão o id.
       and (
         p_responsavel is null
         or (p_responsavel = 'ninguem' and c.assigned_to_user_id is null)
         or c.assigned_to_user_id::text = p_responsavel
       )
       -- 9051: PERÍODO da última mensagem; o corte vem calculado do TypeScript, o
       -- mesmo valor que a lista aplica em `last_message_at`.
       and (p_desde is null or c.last_message_at >= p_desde)
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

comment on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean, uuid, uuid[], text, timestamptz) is
  'As seis contagens das abas da caixa de entrada numa varredura (migration 9029). SECURITY INVOKER: a RLS de conversations vale para quem chama. As regras (fila, terminais, etiquetas limpas) vêm do TypeScript por parâmetro. Desde a 9042, "só não lidas" inclui a conversa que a pessoa marcou como não lida; desde a 9047, p_sem_passo aplica o filtro "Sem próximo passo" (passo_da_conversa); desde a 9049, p_canal_tipo (conversations.channel) e p_grupos (is_group: nulo, só grupos ou sem grupos), os filtros da folha do celular; desde a 9051, p_funil/p_etapas (funis_da_conversa/etapas_da_conversa), p_responsavel (id ou ninguem) e p_desde (last_message_at).';

revoke execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean, uuid, uuid[], text, timestamptz) from public, anon;
grant  execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean, uuid, uuid[], text, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
