-- 9031: a linha não troca de organização em NENHUMA tabela de public, e a
-- atividade do negócio move o relógio de quem a registrou.
--
-- ## P1 do Cassio na #69
--
-- A 9030 pôs `trg_organizacao_nao_muda` só nas 52 tabelas cuja `for all` exigia
-- apenas tenancy. O critério deixou de fora tabelas cuja escrita exige papel,
-- mas cujo papel pode valer nas DUAS organizações de quem tem vínculo em A e B:
-- `messages_update` (viewer de A+B movia mensagem), `conversations_agent_update`
-- (agent de A+B movia a conversa, e B passava a ler o histórico, porque
-- `messages_select` só olha a conversa), `crm_leads_update`, `channel_sessions`,
-- `crm_pipelines`, `conversation_notes`… Em produção, conferido só leitura em
-- 04/10/2026: 0 mensagens, conversas, notas ou leads com organização
-- divergente da do pai. Nunca explorado.
--
-- A regra agora é a mais simples: TODA tabela de `public` com
-- `organization_id` tem a trigger (o laço lê o catálogo; tabela de módulo
-- opcional criada depois entra na próxima aplicação do baseline).
-- `tests/invariants/organizacao-nao-muda-9030.test.ts` reprova tabela nova sem
-- ela.
--
-- Fluxos conferidos antes de generalizar: nenhum troca a organização de uma
-- linha. Os upserts das tabelas novas cujo conflito não inclui a organização
-- regravam a mesma org: `ai_router_members` e `company_people`
-- (`ignoreDuplicates`, viram DO NOTHING), `ai_chunks` (fonte+versão+posição, a
-- fonte é da org), `channel_integrations` (a PK É a organização),
-- `calendar_connections` e `ad_conversion_dispatches` (o conflito inclui a
-- organização). Nenhuma função do baseline faz `organization_id =
-- excluded.organization_id`.
--
-- ## P2-1 do Cassio na #69: `fn_update_last_activity_at`
--
-- A trigger de `crm_lead_activities` era SECURITY INVOKER: o UPDATE em
-- `crm_leads`/`contacts` passava pela RLS de quem inseriu a atividade. A RLS de
-- INSERT de atividades aceita qualquer membro, mas a de UPDATE de leads e
-- contatos exige agent (e, no lead, enxergar o negócio). Então a atividade de
-- um viewer, ou de um agent em modo own num negócio de outro, ficava gravada e
-- o relógio de esfriamento NÃO andava, sem erro nenhum.
--
-- Escolha: SECURITY DEFINER com `search_path` fixo e escopo mínimo (só
-- `last_activity_at`, só a linha referenciada E da mesma organização da
-- atividade), em vez de exigir agent no INSERT de atividades. Motivo: restringir
-- o INSERT mudaria quem pode registrar atividade (fluxos de viewer e de
-- integração que hoje gravam passariam a falhar com 42501), e o defeito não é
-- quem registra, é o carimbo derivado não andar. O carimbo continua sendo só
-- para os tipos da lista positiva da 0079. `fn_validate_activity_lead_org` já
-- garante que a atividade e o negócio são da mesma organização.
--
-- ## FK `on delete set null` (achado na CI desta PR)
--
-- Com a trigger em toda tabela, apagar uma organização quebrava: o FK de
-- `api_audit_log.organization_id` é `on delete set null`, e o Postgres executa
-- essa ação como um UPDATE vindo de outro gatilho. O mesmo vale para
-- `campaigns` e `campaign_recipients` (FK composto (organization_id, x) com
-- `set null` SEM lista de colunas: apagar canal, funil, etapa ou agente zera a
-- organização da linha, comportamento que já existia). A função passa a aceitar
-- só a troca para NULL feita de dentro de outro gatilho (`pg_trigger_depth() >
-- 1`); UPDATE direto continua recusado.
--
-- Rollback: reverter o PR; no banco, recriar a função sem `security definer` e
-- sem o filtro de organização (corpo da 0235) e `drop trigger
-- trg_organizacao_nao_muda` nas tabelas que não estão na lista da 9030.

set local lock_timeout = '3s';

create or replace function public.fn_organizacao_da_linha_nao_muda()
returns trigger
language plpgsql
set search_path = public
as $
begin
  -- A ÚNICA troca aceita é para NULL vinda de dentro de outro gatilho, que é
  -- como o Postgres executa um FK `on delete set null` (9031): apagar a
  -- organização zera `api_audit_log.organization_id`; apagar canal, funil,
  -- etapa ou agente zera `organization_id` de `campaigns`/`campaign_recipients`
  -- (FK composto sem lista de colunas). Isso não move a linha para outra
  -- organização. UPDATE direto, de qualquer papel, para NULL ou para outra org,
  -- continua recusado.
  if new.organization_id is distinct from old.organization_id
     and not (new.organization_id is null and pg_trigger_depth() > 1) then
    raise exception 'a linha de % não muda de organização', tg_table_name
      using errcode = '42501',
            hint = 'Mover dado entre organizações não é uma operação do produto. Crie a linha na organização de destino.';
  end if;
  return new;
end;
$;

revoke all on function public.fn_organizacao_da_linha_nao_muda() from public, anon, authenticated;

do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_attribute a
        on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
     order by c.relname
  loop
    execute format(
      'create or replace trigger trg_organizacao_nao_muda before update of organization_id on public.%I '
      'for each row execute function public.fn_organizacao_da_linha_nao_muda()', t);
  end loop;
end $$;

create or replace function public.fn_update_last_activity_at()
  returns trigger
  language plpgsql
  -- SECURITY DEFINER desde a 9031 (P2-1 do Cassio na #69): como invoker, o
  -- UPDATE abaixo passava pela RLS de quem inseriu a atividade, e para um
  -- viewer (ou agent que não enxerga o negócio) o relógio não andava, em
  -- silêncio. O escopo é o mínimo: só last_activity_at, só da linha
  -- referenciada E da mesma organização da atividade.
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  -- LISTA POSITIVA: só isto conta como "alguém tocou este negócio". Tipo que
  -- não está aqui NÃO quebra o silêncio — inclusive tipo que ainda não existe.
  -- Ver o cabeçalho da 0079 antes de acrescentar linha nesta lista.
  if new.type not in (
    'ai_turn',              -- a IA falou com o cliente
    'note',                 -- alguém registrou trabalho no negócio
    'lead_edited',          -- humano mexeu nos dados
    'stage_changed',        -- humano moveu o negócio
    'next_action_approved', -- humano decidiu agir
    -- (0235) Uma ligação ATENDIDA é interação, e das mais fortes: alguém falou
    -- com o cliente. Sem esta linha o Radar de Risco seguia marcando como frio
    -- quem tinha acabado de passar vinte minutos ao telefone, e a IA propunha
    -- "retomar contato" com quem nunca ficou sem contato.
    --
    -- `voice_call_missed` NÃO entra, e a ausência é a regra e não esquecimento:
    -- telefone que tocou sem resposta é constatação de silêncio, não quebra
    -- dele. É exatamente a assimetria que a 0079 existe para preservar.
    'voice_call'
  ) then
    return new;
  end if;

  update public.crm_leads
     set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
   where id = new.lead_id
     and organization_id = new.organization_id;

  if new.contact_id is not null then
    update public.contacts
       set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
     where id = new.contact_id
       and organization_id = new.organization_id;
  end if;
  return new;
end$function$;

revoke all on function public.fn_update_last_activity_at() from public, anon, authenticated;
