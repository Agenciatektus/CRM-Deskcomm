-- ════════════════════════════════════════════════════════════════════════════
-- 9045 — as etiquetas da conversa mudam por DELTA (acrescentar/remover), e não
-- por regravação da lista inteira
-- ════════════════════════════════════════════════════════════════════════════
--
-- ─── O DEFEITO (achado do @Cassio_SecRev) ───────────────────────────────────
--
-- `PATCH /api/v1/conversations/[id]` recebia `{ tags: [...] }` e gravava a LISTA
-- INTEIRA. O menu de contexto da conversa e o `ConversationTagsEditor` montavam
-- essa lista a partir do que a tela tinha carregado. Quem gravava por último
-- vencia: se outra pessoa, ou a IA pela `crm_manage_tags`, mexesse nas etiquetas
-- entre a leitura da tela e o clique, a mudança dela sumia sem erro nenhum. A
-- `crm_manage_tags` (MCP, client de service role) tinha a mesma corrida do lado
-- dela: lia, montava no app e regravava.
--
-- ─── A TROCA ────────────────────────────────────────────────────────────────
--
-- Duas portas e um núcleo:
--
-- * `fn_conversa_tags_alterar(p_org, p_conversa, p_adicionar, p_remover)` —
--   porta da SESSÃO (PATCH da conversa), definer.
-- * `fn_conversa_tags_alterar_servico(...)` — porta do SERVIÇO (`crm_manage_tags`),
--   definer, só `service_role` (revisão do @Cassio_SecRev, P2).
-- * `fn_conversa_tags_gravar(..., p_da_sessao)` — o núcleo das duas, invoker e
--   revogado de todos: valida, reserva, trava a conversa (`for no key update`),
--   aplica o delta sobre o valor ATUAL e grava na mesma transação. Duas
--   alterações concorrentes de etiquetas diferentes (humano × humano, humano ×
--   IA) se serializam na trava da linha, e a segunda aplica o delta dela sobre o
--   resultado da primeira — as duas ficam.
-- * `fn_conversa_tags_aplicar` — a parte pura (sem tabela): normaliza como o Zod
--   do PATCH (`btrim` + minúsculas, vazia fora, sem repetição pela chave do
--   RESULTADO), acrescenta no fim e tira SÓ o que casa com `p_remover`.
--
-- O formato legado `{ tags }` do PATCH segue regravando a lista inteira, e é o
-- ÚNICO caminho que ainda é "último vence": mantido só por compatibilidade com
-- cliente da API que já o usa. As telas e a IA vão pelo delta.
--
-- ⛔ LRN da 9038 (6): o `case when p_remover then null` sem casar o nome
-- apagava TODAS as etiquetas do registro. Aqui não há `case`: a remoção é um
-- `where not (tag = any(remover))`, e `remover` nunca carrega nulo (nulo em
-- `= any` dá NULO e o `not` dele também, o que derrubaria a linha inteira). O
-- invariante desta migration prova com controle: remover `vip` de
-- {cliente, vip, inadimplente} deixa {cliente, inadimplente}.
--
-- ─── GUARDAS ────────────────────────────────────────────────────────────────
--
-- Porta da sessão:
-- * `fn_tags_guarda(p_org, 'agent')`: `auth.uid()` presente, papel `agent`+ na
--   organização, sessão de suporte em modo leitura recusada, MFA provado de
--   quem tem fator. Piso `agent` porque é o da rota (spec 13 §4) e o da policy
--   `conversations_agent_update`.
-- * VISIBILIDADE: definer não passa pela RLS, então o predicado da policy
--   `conversations_select` (9027) é repetido no `where` — atendente no modo
--   `own_and_unassigned` só mexe na conversa dele ou na sem dono, como antes
--   pela sessão. Viewer já saiu na guarda.
--
-- Porta do serviço: só a conversa de `p_org` (o `p_org` da MCP vem do token,
-- nunca do input); não há sessão, então não há visibilidade de sessão.
--
-- As duas, pelo núcleo:
-- * `fn_tags_reserva(p_org, 'conversa', ...)`: a MESMA regra da etiqueta
--   reservada `cliente`. Hoje ela só reserva no escopo `contato` (o dono gravado
--   em `contacts.client_tag_by_system`, 0262); na conversa ela não recusa nada.
--   A chamada fica para a regra continuar sendo uma só se um dia alcançar a
--   conversa.
-- * Teto de 20 etiquetas (o do Zod): recusa só quando o delta faz a lista
--   CRESCER além de 20, comparando com a lista atual JÁ normalizada (P3 do
--   Cassio: uma legada `{VIP, vip, …}` conta uma vez). Uma conversa legada com
--   mais de 20 continua podendo perder etiqueta.
--
-- Definer, e não invoker, na porta da sessão porque a guarda de MFA lê
-- `auth.mfa_factors`, que a sessão não lê; `fn_session_mfa_proven` e
-- `fn_tags_guarda` são revogadas de `authenticated`.
--
-- ─── ACL ────────────────────────────────────────────────────────────────────
--
-- * `fn_conversa_tags_alterar`: SÓ `authenticated` (createClient de cookie),
--   declarada em AUTHENTICATED_PERMITIDO no gate `hardening-definer-varredura`.
--   Sem `service_role` (P3 do Cassio): a guarda recusa `auth.uid()` nulo, e um
--   grant que nunca executa só confunde.
-- * `fn_conversa_tags_alterar_servico`: SÓ `service_role`.
-- * `fn_conversa_tags_gravar` e `fn_conversa_tags_aplicar`: ninguém de fora;
--   quem as executa é o dono, de dentro das duas portas.
--
-- Prova: `tests/invariants/tags-da-conversa-por-delta-9045.test.ts`.
-- Rollback: reverter o PR (rota e MCP voltam a gravar a lista) e `drop
-- function` das quatro; nenhuma tabela muda.

set local lock_timeout = '3s';

create or replace function public.fn_conversa_tags_aplicar(
  p_tags text[],
  p_adicionar text[],
  p_remover text[]
)
returns text[]
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(n.tag order by n.ord), '{}'::text[])
  from (
    select distinct on (s.tag) s.tag, s.ord
    from (
      select lower(btrim(e.valor)) as tag, e.ord
      from unnest(coalesce(p_tags, '{}'::text[]) || coalesce(p_adicionar, '{}'::text[]))
           with ordinality as e(valor, ord)
      where btrim(coalesce(e.valor, '')) <> ''
    ) s
    -- Só sai o que CASA com a remoção (LRN da 9038). `array_remove(..., null)`:
    -- um nulo em `= any` daria NULO e derrubaria a linha toda.
    where not (s.tag = any (array_remove(
      array(select lower(btrim(r)) from unnest(coalesce(p_remover, '{}'::text[])) as r),
      null)))
    order by s.tag, s.ord
  ) as n;
$$;

revoke execute on function public.fn_conversa_tags_aplicar(text[], text[], text[]) from public, anon, authenticated;

-- O NÚCLEO das duas portas. Invoker e revogado de todos: só roda de dentro das
-- duas definers abaixo, como o dono.
create or replace function public.fn_conversa_tags_gravar(
  p_org uuid,
  p_conversa uuid,
  p_adicionar text[],
  p_remover text[],
  p_da_sessao boolean
)
returns text[]
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_add    text[];
  v_rem    text[];
  v_cru    text[];
  v_antes  text[];
  v_depois text[];
begin
  v_add := array(select distinct lower(btrim(x)) from unnest(coalesce(p_adicionar, '{}'::text[])) as x
                  where btrim(coalesce(x, '')) <> '');
  v_rem := array(select distinct lower(btrim(x)) from unnest(coalesce(p_remover, '{}'::text[])) as x
                  where btrim(coalesce(x, '')) <> '');

  if cardinality(v_add) + cardinality(v_rem) = 0
     or cardinality(v_add) > 20 or cardinality(v_rem) > 20
     or exists (select 1 from unnest(v_add || v_rem) as t where length(t) > 40)
     or v_add && v_rem then
    raise exception 'tags_delta_invalido' using errcode = '22023';
  end if;

  perform public.fn_tags_reserva(p_org, 'conversa', v_add || v_rem);

  -- A trava da linha é o que serializa duas alterações concorrentes. Pela
  -- sessão, o `where` de visibilidade é o da policy `conversations_select`
  -- (9027), menos os ramos de platform admin e viewer, que a guarda já recusou.
  -- Pelo serviço, só a organização.
  select c.tags into v_cru
    from public.conversations c
   where c.id = p_conversa
     and c.organization_id = p_org
     and (
       not p_da_sessao
       or c.organization_id in (
         select e.organization_id from public.fn_escopo_orgs() e
          where e.papel in ('manager', 'admin') or (e.papel = 'agent' and e.modo = 'all'))
       or (c.assigned_to_user_id = auth.uid()
           and c.organization_id in (
             select e.organization_id from public.fn_escopo_orgs() e where e.papel = 'agent'))
       or (c.assigned_to_user_id is null
           and c.organization_id in (
             select e.organization_id from public.fn_escopo_orgs() e
              where e.papel = 'agent' and e.modo = 'own_and_unassigned'))
     )
   for no key update;
  if not found then
    raise exception 'conversa_nao_encontrada' using errcode = 'P0002';
  end if;

  -- O teto compara com a lista atual JÁ normalizada: a crua de uma conversa
  -- legada pode ter `VIP` e `vip`, que viram uma etiqueta só.
  v_antes  := public.fn_conversa_tags_aplicar(v_cru, '{}'::text[], '{}'::text[]);
  v_depois := public.fn_conversa_tags_aplicar(v_antes, v_add, v_rem);
  if cardinality(v_depois) > 20 and cardinality(v_depois) > cardinality(v_antes) then
    raise exception 'tags_limite' using errcode = '23514';
  end if;

  if v_depois is distinct from coalesce(v_cru, '{}'::text[]) then
    -- Calculado de novo sobre `c.tags` dentro do UPDATE: com a linha travada é o
    -- mesmo valor, e o UPDATE nunca grava uma lista lida antes.
    update public.conversations c
       set tags = public.fn_conversa_tags_aplicar(c.tags, v_add, v_rem)
     where c.id = p_conversa
       and c.organization_id = p_org
    returning c.tags into v_depois;
  end if;

  return v_depois;
end;
$$;

revoke execute on function public.fn_conversa_tags_gravar(uuid, uuid, text[], text[], boolean)
  from public, anon, authenticated, service_role;

-- Porta da SESSÃO (PATCH da conversa).
create or replace function public.fn_conversa_tags_alterar(
  p_org uuid,
  p_conversa uuid,
  p_adicionar text[] default '{}'::text[],
  p_remover text[] default '{}'::text[]
)
returns text[]
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_tags_guarda(p_org, 'agent');
  return public.fn_conversa_tags_gravar(p_org, p_conversa, p_adicionar, p_remover, true);
end;
$$;

revoke execute on function public.fn_conversa_tags_alterar(uuid, uuid, text[], text[]) from public, anon, service_role;
grant  execute on function public.fn_conversa_tags_alterar(uuid, uuid, text[], text[]) to authenticated;

-- Porta do SERVIÇO (`crm_manage_tags`, MCP com client de service role).
create or replace function public.fn_conversa_tags_alterar_servico(
  p_org uuid,
  p_conversa uuid,
  p_adicionar text[] default '{}'::text[],
  p_remover text[] default '{}'::text[]
)
returns text[]
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_org is null or p_conversa is null then
    raise exception 'conversa_nao_encontrada' using errcode = 'P0002';
  end if;
  -- A conversa tem de ser de `p_org`: o núcleo filtra por organização e recusa
  -- com P0002 a de outra, sem tocar nela.
  return public.fn_conversa_tags_gravar(p_org, p_conversa, p_adicionar, p_remover, false);
end;
$$;

revoke execute on function public.fn_conversa_tags_alterar_servico(uuid, uuid, text[], text[]) from public, anon, authenticated;
grant  execute on function public.fn_conversa_tags_alterar_servico(uuid, uuid, text[], text[]) to service_role;
