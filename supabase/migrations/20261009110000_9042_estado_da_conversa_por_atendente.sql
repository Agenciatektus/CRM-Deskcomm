-- ════════════════════════════════════════════════════════════════════════════
-- 9042 — fixar, silenciar e marcar como não lida valem POR ATENDENTE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Decisão do Peterson (redesign da Inbox, frente B): fixar, silenciar e marcar
-- como não lida são preferências de CADA pessoa, como no WhatsApp. Quem fixa uma
-- conversa fixa só para si; o colega continua vendo a lista dele na ordem dele.
--
-- Por isso o estado NÃO mora em `conversations` (uma coluna lá seria da equipe
-- inteira). Mora numa tabela própria, uma linha por (conversa, pessoa), criada
-- na primeira preferência e nunca obrigatória: conversa sem linha = nada fixado,
-- nada silenciado, nada marcado.
--
-- ─── COLUNAS ────────────────────────────────────────────────────────────────
--
--   pinned_at         quando fixou; nulo = não fixada. A ordem entre fixadas é
--                     a mais recente primeiro.
--   muted_until       até quando os avisos de mensagem nova ficam calados para
--                     esta pessoa. 'infinity' = "sempre" (o Postgres compara
--                     `muted_until > now()` sem caso especial).
--   marked_unread_at  a pessoa pediu "marcar como não lida". Some ao abrir a
--                     conversa (mark-read ou DELETE /mark-unread).
--
-- `organization_id` é redundante com a conversa, e está aqui de propósito: é a
-- coluna que a RLS, as travas do suporte (0274) e a trava de organização (9031)
-- sabem ler. A coerência com a conversa é cobrada na própria policy de escrita.
--
-- ─── RLS ────────────────────────────────────────────────────────────────────
--
-- Cada pessoa lê e grava SÓ as próprias linhas (`user_id = auth.uid()`), só em
-- organização de que é membro ativo (`fn_user_org_ids()`, que já exclui vínculo
-- revogado) e só em conversa que ela ENXERGA: o `exists` em `conversations` roda
-- com a RLS de conversations de quem chama (9027), então quem não vê a conversa
-- não consegue nem criar preferência sobre ela.
--
-- Viewer PODE gravar: é preferência pessoal, não mexe no atendimento de
-- ninguém. Sessão de suporte em modo somente leitura NÃO grava: as três travas
-- restritivas `support_write_*` (o mesmo desenho da 0274) entram aqui; no
-- baseline quem as põe é a chamada de `fn_aplicar_travas_de_suporte()`, que roda
-- depois deste bloco.
--
-- ─── CONTAGEM DE NÃO LIDAS ──────────────────────────────────────────────────
--
-- `fn_contagens_da_caixa` (9029) é reemitida a partir do corpo da 9029 com UMA
-- diferença: com `p_so_nao_lidas`, conta também a conversa que a pessoa marcou
-- como não lida. O `exists` usa a PK (conversation_id, user_id). Contrato e
-- forma do retorno não mudam.
--
-- Rollback: `drop table if exists public.conversation_user_state cascade;` e
-- reemitir `fn_contagens_da_caixa` da 9029, junto com a reversão do PR. O
-- baseline recria os dois a cada deploy, então reverter só no banco não basta.
--
-- Prova: tests/invariants/estado-por-atendente-9042.test.ts.

set local lock_timeout = '3s';

create table if not exists public.conversation_user_state (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz,
  muted_until timestamptz,
  marked_unread_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

comment on table public.conversation_user_state is
  'Preferências de CADA pessoa sobre uma conversa (migration 9042): fixar, silenciar e marcar como não lida. Uma linha por (conversa, pessoa); sem linha = nada. Cada um lê e grava só as próprias linhas.';

-- A lista pergunta "quais conversas EU fixei nesta organização".
create index if not exists conversation_user_state_lista_idx
  on public.conversation_user_state (user_id, organization_id, pinned_at);

alter table public.conversation_user_state enable row level security;

drop policy if exists conversation_user_state_select on public.conversation_user_state;
create policy conversation_user_state_select on public.conversation_user_state
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists conversation_user_state_insert on public.conversation_user_state;
create policy conversation_user_state_insert on public.conversation_user_state
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_user_state.conversation_id
         and c.organization_id = conversation_user_state.organization_id
    )
  );

drop policy if exists conversation_user_state_update on public.conversation_user_state;
create policy conversation_user_state_update on public.conversation_user_state
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  )
  with check (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_user_state.conversation_id
         and c.organization_id = conversation_user_state.organization_id
    )
  );

drop policy if exists conversation_user_state_delete on public.conversation_user_state;
create policy conversation_user_state_delete on public.conversation_user_state
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  );

revoke all on table public.conversation_user_state from anon, authenticated;
grant select, insert, update, delete on table public.conversation_user_state to authenticated;
grant all on table public.conversation_user_state to service_role;

-- Travas do suporte em modo somente leitura (mesmo desenho da 0274).
drop policy if exists support_write_insert on public.conversation_user_state;
create policy support_write_insert on public.conversation_user_state
  as restrictive for insert to authenticated
  with check (public.fn_support_write_allowed(organization_id));
drop policy if exists support_write_update on public.conversation_user_state;
create policy support_write_update on public.conversation_user_state
  as restrictive for update to authenticated
  using (public.fn_support_write_allowed(organization_id))
  with check (public.fn_support_write_allowed(organization_id));
drop policy if exists support_write_delete on public.conversation_user_state;
create policy support_write_delete on public.conversation_user_state
  as restrictive for delete to authenticated
  using (public.fn_support_write_allowed(organization_id));

-- A linha não troca de organização (9031).
create or replace trigger trg_organizacao_nao_muda
  before update of organization_id on public.conversation_user_state
  for each row execute function public.fn_organizacao_da_linha_nao_muda();

-- 9042: corpo da 9029 com o `or exists` da marcação pessoal de não lida.
create or replace function public.fn_contagens_da_caixa(
  p_organizacao uuid,
  p_comandos_da_fila text[],
  p_terminais text[],
  p_canal uuid default null,
  p_entrada text default null,
  p_so_nao_lidas boolean default false,
  p_marcadores text[] default null,
  p_modo text default 'e'
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

comment on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text) is
  'As seis contagens das abas da caixa de entrada numa varredura (migration 9029). SECURITY INVOKER: a RLS de conversations vale para quem chama. As regras (fila, terminais, etiquetas limpas) vêm do TypeScript por parâmetro. Desde a 9042, "só não lidas" inclui a conversa que a pessoa marcou como não lida.';

revoke execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text) from public, anon;
grant  execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text) to authenticated, service_role;

notify pgrst, 'reload schema';
