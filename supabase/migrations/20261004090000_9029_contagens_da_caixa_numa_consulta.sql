-- 9029: as contagens da caixa de entrada numa consulta só.
--
-- ## O defeito
--
-- `GET /api/v1/conversations/counts` (o badge de cada aba, a cada 30 s por aba
-- aberta) disparava SEIS `count(*)` em `conversations`: fila, automático,
-- minhas, todas, encerradas e arquivadas. Cada um varria as conversas da
-- organização com a RLS, e a fila e o automático ainda calculavam
-- `comando_da_conversa(c)` linha a linha, cada um por conta própria. Em
-- produção eram 1 a 1,5 s por consulta.
--
-- ## A troca
--
-- `fn_contagens_da_caixa` faz UMA varredura e devolve as seis contagens com
-- `count(*) filter (...)`, calculando o comando uma vez por conversa.
--
-- O comando sai de `fn_comando_da_conversa` (a REGRA, a mesma que o campo
-- calculado usa) com o contato juntado UMA vez na consulta, e não de
-- `comando_da_conversa(c)` por linha: aquela é security definer com duas
-- subconsultas a `contacts` por chamada. Medido no Postgres 16 local, 5 mil
-- conversas da org: a base com `comando_da_conversa(c)` levava ~380 ms (o CTE
-- inlineado a chamava uma vez por filtro), ~225 ms materializada, e 48 ms com
-- o contato juntado. A junção é invoker: o contato da conversa é da mesma
-- organização, e quem enxerga a conversa enxerga os contatos da org (vínculo,
-- suporte ou platform admin), então o resultado é o mesmo. O teste de
-- equivalência compara com `comando_da_conversa(c)` e `tags_do_contato(c)`.
--
-- * SECURITY INVOKER: a RLS de `conversations` (a de conjunto da 9027) vale
--   para quem chama, igual às seis consultas que ela substitui. Um agent em modo
--   `own` continua contando só o seu escopo. Não precisa de definer: depois da
--   9027 a policy é um semi-join barato, e a varredura única é o ganho.
-- * As REGRAS continuam no TypeScript e entram como parâmetro: a lista da fila
--   (`comandosDaFila`, que depende de a organização ter agente automático), os
--   estados terminais de "Minhas" (`CONVERSATION_TERMINAL_STATUSES`) e as
--   etiquetas já limpas por `marcadoresEscolhidos`. Aqui só existe o predicado
--   das etiquetas, o mesmo que a régua de `lib/inbox/marcador-da-conversa.ts`
--   manda para a PostgREST: `cs` (todas, na mesma caixa) no modo E e com uma
--   etiqueta só, `ov` (qualquer uma) no modo OU, nas duas caixas (`tags` e
--   o `tags` do contato juntado, que é o que `tags_do_contato(c)` lê). `tests/invariants/contagens-da-caixa-9029.test.ts`
--   compara, por papel e por filtro, os números da função com os das consultas
--   antigas.
-- * EXECUTE só para `authenticated` (e `service_role`); `public` e `anon`
--   revogados, porque função nova em `public` nasce exposta.
--
-- Rollback: `drop function if exists public.fn_contagens_da_caixa(uuid, text[],
-- text[], uuid, text, boolean, text[], text);` junto com a reversão do PR (a
-- rota volta às seis consultas). O `baseline.sql` recria a função a cada
-- deploy, então reverter só no banco não basta.

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
       and (not coalesce(p_so_nao_lidas, false) or c.unread_count_for_assignee > 0)
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
  'As seis contagens das abas da caixa de entrada numa varredura (migration 9029). SECURITY INVOKER: a RLS de conversations vale para quem chama. As regras (fila, terminais, etiquetas limpas) vêm do TypeScript por parâmetro.';

revoke execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text) from public, anon;
grant  execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text) to authenticated, service_role;

notify pgrst, 'reload schema';
