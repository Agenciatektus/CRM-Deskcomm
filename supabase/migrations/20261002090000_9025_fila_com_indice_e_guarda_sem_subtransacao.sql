-- 9025 · Pacote seguro de banco: a fila `queued` ganha índice, dois índices sem
-- leitor saem da `event_log` e a guarda do gateway deixa de abrir subtransação.
--
-- Origem: _Infra/planos/2026-10-01-banco-crm-otimizacoes-postgres-elite.md (mono
-- da agência), itens #5, #7 e #8 do @Caio_Sniper, seções 2.3 e 2.4 do
-- @Nuno_Arquiteto e o veto do @Otto_Guardiao (3.5/3.7). Medido em produção, só com
-- leitura, entre 28/09 e 01/10/2026.
--
-- ═══ 1. ÍNDICE DA FILA `queued` DE `messages` ═══
--
-- `redriveQueued` (lib/agent-engine/edge/crm/session-reconciler.ts) roda a cada
-- tique do watchdog duas consultas com o mesmo núcleo: `m.status = 'queued'` +
-- `m.created_at < now() - X`, uma delas com `order by m.created_at limit N`, a
-- outra um `count(*)`. Nenhum índice cobria `queued`: o parcial
-- `idx_messages_org_status_created` é de `sending`/`failed` e começa por
-- `organization_id`, que essas consultas não filtram. Medido: Seq Scan em
-- `messages`, 9.290 linhas filtradas e 495 buffers por chamada, 3.571 chamadas em
-- 48 h, 2,6 s em média.
--
-- Parcial em `status = 'queued'` porque é o conjunto vivo (dezenas de linhas, não
-- a tabela); `created_at` como única coluna porque serve à faixa E à ordem do
-- `limit`. `sent_via` e o join com `channel_sessions` ficam como filtro sobre um
-- punhado de linhas.
--
-- Sem `CONCURRENTLY` aqui, de propósito (o mesmo racional da 9022): migration roda
-- dentro de transação e `CREATE INDEX CONCURRENTLY` aborta dentro de uma. Em
-- produção ele é criado À MÃO com `concurrently` ANTES do deploy, e o
-- `if not exists`, que casa por NOME, torna esta linha no-op lá. Em clone novo a
-- tabela nasce pequena e o bloqueio é instantâneo.
--
-- ═══ 2. DOIS ÍNDICES DA `event_log` SEM LEITOR ═══
--
-- `event_log_consumed_by_gin` e `event_log_dead_idx`: 0 scans em produção desde o
-- último reset de estatística, e a `event_log` é a tabela mais escrita do CRM
-- (74.686 updates em 48 h, 9 índices, só 13 HOT). Conferido no código:
--   - nada usa `@>`, `<@` ou `&&` em `consumed_by` — o único predicado sobre ele é
--     `$1 = any(consumed_by)` (lib/agent-engine/edge/crm/drain.ts), que o GIN de
--     array não atende;
--   - nada lê `event_log` filtrando `status = 'dead'` por organização e data — a
--     poda (`fn_podar_event_log`, 9021) usa `status in ('done','dead')` com o seu
--     próprio índice.
-- O baseline deixou de criá-los no corpo do dump (senão todo deploy os
-- recriaria: o CRM reaplica o `baseline.sql` inteiro a cada deploy, sem
-- `schema_migrations`) e o apêndice os derruba onde ainda existem.
-- Em produção o drop é feito À MÃO com `drop index concurrently` antes do deploy;
-- aqui o `if exists` vira no-op.
--
-- ═══ 3. A GUARDA DO GATEWAY SEM BLOCO `EXCEPTION` ═══
--
-- `fn_pgrst_recusar_replay_do_gateway()` (0250) é o `pgrst.db_pre_request`: roda
-- antes de TODA requisição do PostgREST (1,1 milhão de chamadas em 48 h). O corpo
-- tinha `exception when others`, e em plpgsql todo bloco com EXCEPTION abre uma
-- subtransação na entrada, tenha erro ou não — custo fixo por requisição
-- (≈1.900 s de banco em 48 h).
--
-- O bloco existia para um caso só: o cast `::jsonb` de um cabeçalho que não fosse
-- JSON. A versão nova não faz cast nenhum: tira o `sb-request-id` do texto cru
-- com uma expressão regular que só casa um UUIDv7 completo, em minúsculas, como
-- valor da chave. Sem cast de JSON, sem cast que possa falhar (o `::bit(48)` só
-- vê 12 dígitos hexadecimais que a própria regex garantiu), então não sobra erro
-- para capturar e o PT409 continua sendo a única exceção que sai daqui.
--
-- Por que não a versão do plano (`pg_input_is_valid` antes do cast):
-- `pg_input_is_valid` é do Postgres 16, e o piso do produto é o 15
-- (tests/unit/baseline-no-piso-do-postgres.test.ts reprova o token). Num pg15 a
-- função seria CRIADA (plpgsql resolve chamada só ao executar) e falharia em
-- TODA requisição — o PostgREST inteiro fora do ar.
--
-- Uma chave `sb-request-id` escrita DENTRO do valor de outro cabeçalho não casa:
-- no JSON serializado as aspas internas viram `\"`, e a regex exige a aspa colada
-- ao nome. No pior caso quem forja um cabeçalho recebe 409 na própria requisição.
--
-- Mesmo nome, mesma assinatura, mesmas ACLs (os três papéis de requisição
-- precisam de EXECUTE, senão a própria guarda vira 5xx).
--
-- Rollback: corpo da 0250 (`create or replace` com o bloco `exception`);
-- `create index concurrently` dos dois índices da `event_log` com a definição da
-- linha que saiu do baseline; `drop index concurrently idx_messages_queued_created`.
--
-- Idempotente: `create index if not exists`, `drop index if exists`,
-- `create or replace function`, grants repetíveis.

create index if not exists idx_messages_queued_created
  on public.messages (created_at)
  where status = 'queued';

drop index if exists public.event_log_consumed_by_gin;
drop index if exists public.event_log_dead_idx;

create or replace function public.fn_pgrst_recusar_replay_do_gateway()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  rid text;
  aceito_ha interval;
begin
  -- Só UUIDv7 (versão 7 no 3º grupo) carrega instante; qualquer outra coisa —
  -- cabeçalho ausente, vazio, fora de JSON, id de outro formato — passa.
  rid := substring(
    coalesce(current_setting('request.headers', true), '')
    from '"sb-request-id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12})"'
  );
  if rid is null then
    return;
  end if;
  aceito_ha := now() - to_timestamp((('x' || replace(left(rid, 13), '-', ''))::bit(48)::bigint) / 1000.0);
  if aceito_ha > interval '5 minutes' then
    raise exception 'gateway_replay'
      using errcode = 'PT409',
            detail  = format('sb-request-id %s foi aceito pelo gateway há %s', rid, aceito_ha),
            hint    = 'A requisição original já expirou; esta é uma reexecução do gateway de uma resposta 5xx antiga.';
  end if;
end;
$$;

revoke all on function public.fn_pgrst_recusar_replay_do_gateway() from public, anon;
grant execute on function public.fn_pgrst_recusar_replay_do_gateway() to anon, authenticated, service_role;

notify pgrst, 'reload config';
