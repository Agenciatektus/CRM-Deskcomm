-- 9048: "Tentar de novo" sem duplicar, e `resolved` como conversa encerrada
-- no próximo passo (fase 8b do visual v2 da Inbox).
--
-- ═══ 1. UM REENVIO POR MENSAGEM QUE FALHOU (B15) ═══
--
-- O "Tentar de novo" numa mensagem de saída `failed` é um envio comum pela
-- MESMA rota (`POST /api/v1/messages`) com `reenvio_de`, que grava uma linha
-- NOVA com `metadata.reenvio_de = <id da que falhou>`. A linha que falhou não é
-- reaproveitada: o status dela é escrito pelo motor e pelo webhook do provedor,
-- e voltá-la a `queued` apagaria do histórico que ela falhou. A mensagem nova é
-- de SAÍDA, então os gatilhos que acordam a IA (que olham `direction =
-- 'inbound'`) não disparam.
--
-- A rota confere antes (mesma organização, mesma conversa, mesmo canal, saída,
-- `failed`, ainda não reenviada: `lib/messaging/reenvio.ts`). Este índice único
-- é a trava que vale contra dois cliques simultâneos: o segundo INSERT bate
-- 23505 e a rota responde 409 "Esta mensagem já foi reenviada". Parcial: só as
-- linhas que são reenvio entram nele, então o custo de escrita das outras
-- mensagens não muda.
--
-- ═══ 2. `resolved` É ENCERRADA (P2 do Cassio na #158) ═══
--
-- `passo_da_conversa` (9047) tratava como encerrada só `closed` e `archived`.
-- `resolved` também é desfecho (é um dos estados que o resto do produto exclui
-- de "aberta", ver `app/api/v1/agenda/agendamentos/[id]/route.ts`), e a conversa
-- resolvida aparecia com "Tarefa atrasada" / "Sem próximo passo" e entrava no
-- filtro. Corpo igual ao da 9047 com `resolved` na lista. A assinatura não muda,
-- então `create or replace` basta e `fn_contagens_da_caixa`, que chama esta
-- função, segue igual.
--
-- ═══ ÍNDICE EM PRODUÇÃO ═══
--
-- Sem `CONCURRENTLY` aqui (migration roda em transação; padrão da 9022/9025).
-- Em produção, criar à mão ANTES do deploy, fora de transação:
--
--   set lock_timeout = '3s';
--   create unique index concurrently if not exists messages_reenvio_unico
--     on public.messages (organization_id, (metadata->>'reenvio_de'))
--     where metadata ? 'reenvio_de';
--
-- Hoje nenhuma linha tem `reenvio_de`, então o índice nasce vazio e a varredura
-- de `messages` (cerca de 26 mil linhas, 13 MB em 10/10/2026) leva menos de 1 s.
-- Conferir: `select indexrelid::regclass from pg_index where not indisvalid;`
-- vazio; se ficar inválido, `drop index concurrently` e repetir.
--
-- Rollback: `drop index if exists public.messages_reenvio_unico;` e reemitir
-- `passo_da_conversa` com o corpo da 9047, junto com a reversão do PR (o
-- `baseline.sql` recria tudo a cada deploy).
--
-- Prova: tests/invariants/reenvio-e-resolvida-9048.test.ts.

set local lock_timeout = '3s';

create unique index if not exists messages_reenvio_unico
  on public.messages (organization_id, (metadata->>'reenvio_de'))
  where metadata ? 'reenvio_de';


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
      or c.status::text in ('closed', 'archived', 'resolved')
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
  'Campo calculado do PostgREST: sem_passo (contato sem tarefa aberta), atrasada (tarefa aberta vencida) ou em_dia; nulo em conversa fechada (closed ou resolved), arquivada, de grupo ou sem contato. Pílula e filtro "Sem próximo passo" da Inbox (migrations 9047 e 9048).';

notify pgrst, 'reload schema';
