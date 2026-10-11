-- 9047: os dados que o visual v2 da Inbox pedia ao banco (fase 8a).
--
-- A auditoria protótipo × CRM (docs/design/inbox-v2/auditoria-2026-10-09.md)
-- deixou para a fase 8 o que dependia de dado. Esta migration entrega o lado do
-- banco de quatro itens, e os índices que as buscas pediam:
--
--   S14  contador de tarefas atrasadas no item "Tarefas" do menu;
--   S18  contagem de leads abertos em cada funil do nó "Pipeline";
--   L4   filtro "Sem próximo passo" na Inbox (e o badge das abas espelhando);
--   L20  pílula "Tarefa atrasada" / "Sem próximo passo" na linha da lista;
--   L14  prefixo "Você:" / "IA:" na prévia da lista;
--   P2 do Cassio na #147: índices trigram para as buscas de contato e de lead.
--
-- ═══ 1. AS DUAS CONTAGENS DO MENU ═══
--
-- `fn_tarefas_atrasadas(org)`: quantas tarefas ABERTAS (`pending`,
-- `in_progress`) com prazo vencido estão com QUEM PEDE (`assigned_to =
-- auth.uid()`). Toda a organização LÊ todas as tarefas (`crm_tasks_select`),
-- então o recorte não é de permissão, é de pergunta: o número no menu é "o que
-- venceu na SUA mão", o único que a pessoa pode resolver sozinha. Tarefa sem
-- responsável não entra; a tela de Tarefas continua mostrando tudo.
-- Plano: Index Scan em `crm_tasks_atrasadas_do_responsavel_idx` (igualdade em
-- organização e responsável, faixa em `due_date`), parcial nas abertas com
-- prazo, então o índice só carrega o conjunto vivo.
--
-- `fn_leads_abertos_por_funil(org)`: `count(*)` de `status = 'open'` agrupado
-- por funil. Usa o índice que já existe, `idx_crm_leads_org_pipeline_status`
-- (organization_id, pipeline_id, status): Index Only Scan para quem enxerga a
-- organização inteira. Para o `agent` em modo `own*` a policy lê
-- `owner_user_id`, e aí é Index Scan com ida ao heap só nas linhas abertas da
-- organização, que é o mesmo custo do quadro que ele já abre.
--
-- As duas são SECURITY INVOKER: a RLS de `crm_tasks` e de `crm_leads` vale para
-- quem chama. O `agent` em modo `own` conta só os leads que o quadro mostra a
-- ele, e nunca o total da organização. Não há definer, então não há o que
-- vazar entre organizações: o parâmetro de organização filtra, e a RLS decide.
--
-- ═══ 2. O PRÓXIMO PASSO E O AUTOR DA ÚLTIMA MENSAGEM, NA PRÓPRIA LISTA ═══
--
-- Dois campos calculados do PostgREST (o mesmo desenho do `tags_do_contato` da
-- 0323), pedidos no `select` da lista: zero consulta a mais por página e nada
-- de N+1. Cada linha custa uma sondagem de índice.
--
-- `passo_da_conversa(c)`: 'sem_passo' quando o contato não tem tarefa aberta,
-- 'atrasada' quando tem uma aberta com prazo vencido, 'em_dia' no resto. Nulo
-- para conversa fechada ou arquivada, de grupo ou sem contato: não há próximo
-- passo a cobrar ali, e a pílula e o filtro somem juntos. A régua é a do painel
-- (`useTarefasDoContato`): tarefa do CONTATO, porque toda tarefa presa a um
-- negócio herda o contato dele. Índice: `crm_tasks_abertas_do_contato_idx`
-- (contact_id, due_date) parcial nas abertas, com `organization_id` no INCLUDE
-- para a policy não precisar do heap.
--
-- `autor_da_ultima_mensagem(c)`: de quem é a última mensagem da conversa
-- ('cliente', 'ia', 'automacao' ou 'equipe'), lida pelo índice que já existe,
-- `idx_messages_conversation_sent` (conversation_id, sent_at desc), com
-- `limit 1`. Reação não conta: ela não muda a prévia.
--
-- O filtro "Sem próximo passo" é `passo_da_conversa=eq.sem_passo` na lista, e
-- `fn_contagens_da_caixa` ganha `p_sem_passo` com o MESMO predicado (o campo
-- calculado, não uma cópia), para o badge das abas contar o que a lista mostra.
-- A assinatura muda (9 parâmetros), então a de 8 cai antes: com as duas de pé,
-- a chamada da rota por nome seria ambígua. Corpo igual ao da 9042 mais o
-- predicado novo.
--
-- ═══ 3. ÍNDICES TRIGRAM (P2 do Cassio na #147) ═══
--
-- A busca de contatos (rota de contatos, Inbox e Ctrl K) faz `ilike '%termo%'`
-- em `display_name` e `phone_number`; a de leads, em `title`. Sem trigram, todo
-- `%termo%` é Seq Scan na organização. `name` já tinha
-- (`idx_contacts_org_name_trgm`). `pg_trgm` está em `public` desde a instalação
-- (a mesma do índice de `name`).
--
-- ═══ ÍNDICE EM TABELA GRANDE: O PADRÃO DO REPO (9022, 9025) ═══
--
-- Sem `CONCURRENTLY` aqui, de propósito: migration roda dentro de transação e
-- `create index concurrently` aborta dentro de uma. Em PRODUÇÃO os cinco
-- índices são criados À MÃO, um comando por vez, fora de transação, ANTES do
-- deploy; o `if not exists`, que casa por NOME, torna as linhas abaixo no-op lá.
-- Em clone novo as tabelas nascem pequenas e o bloqueio é instantâneo.
--
--   set lock_timeout = '3s';
--   create index concurrently if not exists crm_tasks_abertas_do_contato_idx
--     on public.crm_tasks (contact_id, due_date) include (organization_id)
--     where contact_id is not null and status in ('pending', 'in_progress');
--   create index concurrently if not exists crm_tasks_atrasadas_do_responsavel_idx
--     on public.crm_tasks (organization_id, assigned_to, due_date)
--     where due_date is not null and status in ('pending', 'in_progress');
--   create index concurrently if not exists idx_contacts_display_name_trgm
--     on public.contacts using gin (display_name public.gin_trgm_ops);
--   create index concurrently if not exists idx_contacts_phone_number_trgm
--     on public.contacts using gin (phone_number public.gin_trgm_ops);
--   create index concurrently if not exists idx_crm_leads_title_trgm
--     on public.crm_leads using gin (title public.gin_trgm_ops);
--
-- Conferir depois: `select indexrelid::regclass, indisvalid from pg_index where
-- not indisvalid;` vazio. Um `concurrently` interrompido deixa índice INVÁLIDO
-- com o nome tomado, e o `if not exists` o daria por pronto: nesse caso,
-- `drop index concurrently` e repetir.
--
-- Rollback: `drop function if exists public.fn_tarefas_atrasadas(uuid),
-- public.fn_leads_abertos_por_funil(uuid), public.passo_da_conversa(public.conversations),
-- public.autor_da_ultima_mensagem(public.conversations);` e reemitir
-- `fn_contagens_da_caixa` com o corpo da 9042 (8 parâmetros), derrubando a de 9
-- (`drop function if exists public.fn_contagens_da_caixa(uuid, text[], text[],
-- uuid, text, boolean, text[], text, boolean)`), junto com a reversão do PR. Os
-- índices podem ficar (só custam escrita). O `baseline.sql` recria tudo a cada
-- deploy, então reverter só no banco não basta.
--
-- Prova: tests/invariants/inbox-v2-dados-9047.test.ts.

set local lock_timeout = '3s';

-- ---- índices ----
create index if not exists crm_tasks_abertas_do_contato_idx
  on public.crm_tasks (contact_id, due_date) include (organization_id)
  where contact_id is not null and status in ('pending', 'in_progress');

create index if not exists crm_tasks_atrasadas_do_responsavel_idx
  on public.crm_tasks (organization_id, assigned_to, due_date)
  where due_date is not null and status in ('pending', 'in_progress');

create index if not exists idx_contacts_display_name_trgm
  on public.contacts using gin (display_name public.gin_trgm_ops);

create index if not exists idx_contacts_phone_number_trgm
  on public.contacts using gin (phone_number public.gin_trgm_ops);

create index if not exists idx_crm_leads_title_trgm
  on public.crm_leads using gin (title public.gin_trgm_ops);

-- ---- S14: tarefas atrasadas de quem pede ----
create or replace function public.fn_tarefas_atrasadas(p_organizacao uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
    from public.crm_tasks t
   where t.organization_id = p_organizacao
     and t.assigned_to = (select auth.uid())
     and t.status in ('pending', 'in_progress')
     and t.due_date < now()
$$;

comment on function public.fn_tarefas_atrasadas(uuid) is
  'Quantas tarefas abertas com prazo vencido estão com quem chama (auth.uid()), na organização. SECURITY INVOKER: a RLS de crm_tasks vale. Contador do menu (migration 9047).';

revoke execute on function public.fn_tarefas_atrasadas(uuid) from public, anon;
grant  execute on function public.fn_tarefas_atrasadas(uuid) to authenticated, service_role;

-- ---- S18: leads abertos por funil ----
create or replace function public.fn_leads_abertos_por_funil(p_organizacao uuid)
returns table (pipeline_id uuid, abertos integer)
language sql
stable
security invoker
set search_path = public
as $$
  select l.pipeline_id, count(*)::integer
    from public.crm_leads l
   where l.organization_id = p_organizacao
     and l.status = 'open'
   group by l.pipeline_id
$$;

comment on function public.fn_leads_abertos_por_funil(uuid) is
  'Leads abertos por funil na organização, contados pela RLS de crm_leads de quem chama (SECURITY INVOKER): o agent em modo own conta só o que o quadro mostra a ele. Nó Pipeline do menu (migration 9047).';

revoke execute on function public.fn_leads_abertos_por_funil(uuid) from public, anon;
grant  execute on function public.fn_leads_abertos_por_funil(uuid) to authenticated, service_role;

-- ---- L4/L20: o próximo passo da conversa (campo calculado) ----
create or replace function public.passo_da_conversa(c public.conversations)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when c.contact_id is null
      or coalesce(c.is_group, false)
      or c.status::text in ('closed', 'archived')
      then null
    when not exists (
      select 1 from public.crm_tasks t
       where t.contact_id = c.contact_id
         and t.organization_id = c.organization_id
         and t.status in ('pending', 'in_progress')
    ) then 'sem_passo'
    when exists (
      select 1 from public.crm_tasks t
       where t.contact_id = c.contact_id
         and t.organization_id = c.organization_id
         and t.status in ('pending', 'in_progress')
         and t.due_date < now()
    ) then 'atrasada'
    else 'em_dia'
  end
$$;

comment on function public.passo_da_conversa(public.conversations) is
  'Campo calculado do PostgREST: sem_passo (contato sem tarefa aberta), atrasada (tarefa aberta vencida) ou em_dia; nulo em conversa fechada, arquivada, de grupo ou sem contato. Pílula e filtro "Sem próximo passo" da Inbox (migration 9047).';

revoke execute on function public.passo_da_conversa(public.conversations) from public, anon;
grant  execute on function public.passo_da_conversa(public.conversations) to authenticated, service_role;

-- ---- L14: de quem é a última mensagem (campo calculado) ----
create or replace function public.autor_da_ultima_mensagem(c public.conversations)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when m.direction = 'inbound' then 'cliente'
    when m.sent_via = 'ai' then 'ia'
    when m.sent_via in ('automation', 'system') then 'automacao'
    else 'equipe'
  end
    from public.messages m
   where m.conversation_id = c.id
     and m.organization_id = c.organization_id
     and m.type <> 'reaction'
   order by m.sent_at desc
   limit 1
$$;

comment on function public.autor_da_ultima_mensagem(public.conversations) is
  'Campo calculado do PostgREST: cliente, ia, automacao ou equipe, para a última mensagem da conversa (reação não conta). Prefixo "Você:"/"IA:" da prévia na lista da Inbox (migration 9047).';

revoke execute on function public.autor_da_ultima_mensagem(public.conversations) from public, anon;
grant  execute on function public.autor_da_ultima_mensagem(public.conversations) to authenticated, service_role;

-- ---- L4: o badge das abas conta o filtro "Sem próximo passo" ----
drop function if exists public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text);

create or replace function public.fn_contagens_da_caixa(
  p_organizacao uuid,
  p_comandos_da_fila text[],
  p_terminais text[],
  p_canal uuid default null,
  p_entrada text default null,
  p_so_nao_lidas boolean default false,
  p_marcadores text[] default null,
  p_modo text default 'e',
  p_sem_passo boolean default false
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

comment on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean) is
  'As seis contagens das abas da caixa de entrada numa varredura (migration 9029). SECURITY INVOKER: a RLS de conversations vale para quem chama. As regras (fila, terminais, etiquetas limpas) vêm do TypeScript por parâmetro. Desde a 9042, "só não lidas" inclui a conversa que a pessoa marcou como não lida; desde a 9047, p_sem_passo aplica o filtro "Sem próximo passo" (passo_da_conversa).';

revoke execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean) from public, anon;
grant  execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
