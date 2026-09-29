-- 9021 — O BUS DE EVENTOS GANHA PODA. O QUE AINDA NÃO FOI PROCESSADO NUNCA SAI.
--
-- ═══ O DEFEITO, MEDIDO NUMA INSTALAÇÃO REAL ═══
--
-- Entre 27 e 29/09/2026 o banco de um cliente (Supabase free, cota de 500 MB)
-- chegou a 735 MB e o projeto entrou em `default_transaction_read_only`. Dois
-- dias sem sistema, e 36–37% dos webhooks de WhatsApp recusados — o FZAP não
-- reenvia, então essas mensagens não existem no CRM. O culpado daquela vez foi
-- `webhook_events_log` (661 MB, 90% do banco), cuja poda EXISTIA em código e
-- nunca tinha sido agendada; hoje ela roda de 5 em 5 minutos.
--
-- Com o banco já limpo (77 MB), a medição de 29/09 encontra o próximo da fila:
--
--     event_log ........ 13,0 MB   16.094 linhas   sem poda nenhuma
--     api_audit_log .....  7,5 MB   8.976 linhas   podada (5 anos, regra L-10)
--
--     $ grep -rn "event_log" supabase/migrations/*.sql | grep -i delete
--     (só FKs `on delete cascade`/`set null` — nada que apague a própria tabela)
--
-- Ou seja: `api_audit_log` tem dono (a 0167 lhe deu `fn_expurgar_auditoria_
-- vencida`, chamada pelo cron `data-retention` desde então), e o que ela guarda
-- é rastro legal de cinco anos — nada a mudar aqui. `event_log` não tem dono
-- nenhum. É um BUS: a linha existe para ser consumida, e depois de consumida ela
-- é resíduo. Um bus sem poda é um arquivo permanente por acidente.
--
-- ═══ O QUE NUNCA SAI, E POR QUÊ ═══
--
-- `status` tem quatro valores (CHECK no baseline): `pending`, `processing`,
-- `done`, `dead`. Só os dois ÚLTIMOS são podáveis, e o corte por status vem
-- ANTES do corte por idade:
--
--   - `pending` é trabalho que ainda vai sair. O dreno o reclama pelo relógio
--     (`next_attempt_at`), e um evento pendente de 200 dias não é lixo velho:
--     é um dreno que parou. Apagá-lo transformaria uma pane visível (fila que
--     cresce) numa pane invisível (fila que some sozinha);
--   - `processing` está com um dreno AGORA, ou ficou órfão de um que morreu no
--     meio — e nesse caso `lib/routing/worker.ts` o devolve para `pending`.
--     Apagar por idade competiria com essa recuperação, e a corrida seria
--     ganha pela poda, em silêncio.
--
-- O corte é por `created_at` e nunca por `updated_at`: o dreno reescreve
-- `updated_at` a cada tentativa (`trg_event_log_touch`), e medir idade por
-- coluna que alguém atualiza faz a linha REJUVENESCER — a mesma lição que a
-- 0167 escreveu sobre `locked_at`/`run_after` em `job_queue`.
--
-- ═══ 120 DIAS DE DEFAULT, PISO DE 90 — E OS DOIS NÚMEROS TÊM DONO ═══
--
-- O piso NÃO é escolha de gosto: as telas de IA leem `event_log` direto, por
-- `created_at`, e a janela máxima delas é de 90 dias — `MAX_RANGE_DAYS = 90` em
-- `app/api/v1/ai/usage/route.ts` e em `app/api/v1/ai/evolution/route.ts`, que
-- contam `ai.handoff_triggered`; `app/api/v1/ai/operator-metrics/route.ts` olha
-- 30. Um piso abaixo de 90 faria o knob de espaço virar apagador de GRÁFICO: o
-- operador digitaria `EVENT_LOG_RETENTION_DAYS=30` para liberar disco e a
-- resposta seria um painel que emagrece sem dizer por quê. Com o piso dentro da
-- função (`greatest(..., 90)`), esse caminho não existe nem por `psql`.
--
-- O default é 120 e não 90 porque 90 é EXATAMENTE a borda da janela: com os dois
-- números iguais, o dia mais antigo do gráfico cairia no meio da poda diária e a
-- última barra encolheria ao longo do dia. Um mês de folga acaba com a borda.
--
-- ═══ O EFEITO EM CASCATA, DECLARADO ═══
--
-- Três tabelas apontam para `event_log`, e duas delas não perdem nada:
-- `automation_rule_runs.event_id` e
-- `appointment_recovery_receipts.source_event_id` são `on delete set null` — o
-- histórico FICA, só perde o ponteiro. O botão "Reenviar" de um run antigo já
-- sabe disso: ele responde `event_gone` / 409 quando o evento não está mais lá,
-- e esse código é ANTERIOR a esta migration (o caminho já era possível por
-- `truncate` ou por remoção manual).
-- `event_service_origins.event_id` é `on delete cascade`, e a própria 0223
-- escreveu no cabeçalho dela que "retenção acompanha event_log" — é recibo do
-- evento, não sobrevive a ele por definição.
--
-- O aviso `event_dead` da Central NÃO aponta para a linha (o dreno grava
-- `ref_kind` nulo, ver `lib/event-log/aviso-do-laco.ts`), então não há aqui o
-- anti-join contra aviso aberto que a 0167 precisou fazer em `job_queue`. O
-- texto do que morreu vive no próprio aviso, que tem retenção própria.
--
-- `watchdog_cursors` — cursor por (`last_created_at`, `last_event_id`) — tem
-- ZERO consumidores em TypeScript hoje (`lib/followup/reactivity.ts` diz isso
-- por escrito). Um cursor que avança não é ferido por poda da ponta velha.
--
-- ═══ POR QUE ESTA FUNÇÃO NÃO PRECISA SER `security definer` — E É ═══
--
-- Ao contrário de `api_audit_log`, `event_log` tem `GRANT ALL` a `service_role`
-- no baseline: o admin client apagaria por `supabase-js` sem função nenhuma. A
-- função existe pelos outros três motivos que a 0167 já tinha: o predicado de
-- status mora no BANCO e vale para qualquer chamador (inclusive um `psql` na
-- mão às 2h da manhã); o piso também; e `delete ... using (select ... limit n)`
-- é a única forma de lotear o DELETE, porque `supabase-js` não escreve
-- `delete ... where id in (select ... limit n)`.
--
-- ═══ VACUUM: DELIBERADAMENTE AUSENTE ═══
--
-- DELETE devolve o espaço ao autovacuum para REUSO, não ao sistema de arquivos;
-- só `VACUUM FULL` faz isso, e ele trava a tabela. `event_log` é escrita por
-- todo gatilho e lida pelo dreno a cada minuto — travá-la de madrugada, sem
-- ninguém olhando, é pior que a cota apertada. Mesma decisão, mesma razão e
-- mesmo runbook do cron `data-retention`
-- (`docs/runbooks/custo-e-cota-do-supabase.md`). Em regime estável a tabela para
-- de crescer, que é o que a cota pede; quem precisa dos MB de volta HOJE roda o
-- `VACUUM FULL` do runbook com a decisão na mão.
--
-- Idempotente: `create index if not exists` + `create or replace function` +
-- `revoke` (no-op quando o privilégio já não existe). Nenhuma constraint nova.

-- O índice da poda. Sem ele, `where status in (...) and created_at < corte` cai
-- em seq scan diário sobre a tabela inteira — trocaria a conta de disco pela de
-- CPU, que é o outro lado do mesmo problema. Parcial nos DOIS status podáveis:
-- é exatamente o conjunto que a função visita, e deixa `pending`/`processing`
-- (as linhas quentes, com índices próprios) fora do índice.
--
-- Nome próprio da poda de propósito: `create index if not exists` casa por NOME,
-- e um nome genérico poderia já existir num clone com OUTRA definição e virar
-- no-op silencioso.
create index if not exists idx_event_log_poda
  on public.event_log (created_at)
  where status in ('done', 'dead');

create or replace function public.fn_podar_event_log(
  p_retencao_dias int default null,
  p_limite int default null
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- 120 dias de default e piso de 90. Ver o cabeçalho: 90 é a janela máxima das
  -- telas de IA que leem esta tabela, e o piso é o que impede o knob de espaço
  -- de virar apagador de gráfico.
  v_dias int := greatest(coalesce(p_retencao_dias, 120), 90);
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 10000);
  v_apagados int;
begin
  with vencidos as (
    select e.id
      from public.event_log e
     -- O corte por STATUS vem antes do de idade, e não é filtro de desempenho:
     -- é a garantia de que a poda nunca perde trabalho não processado.
     where e.status in ('done', 'dead')
       and e.created_at < now() - make_interval(days => v_dias)
     order by e.created_at
     limit v_limite
  )
  delete from public.event_log e
   using vencidos v
   where e.id = v.id;
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

-- As DUAS origens de EXECUTE (doutrina de migrations, item 9): `revoke from
-- public` não tira o grant DIRETO que o `ALTER DEFAULT PRIVILEGES ... TO anon`
-- do baseline dá a toda função nova; `revoke from anon` não tira o grant a
-- PUBLIC que o Postgres dá na criação. `authenticated` entra porque nenhuma tela
-- chama esta função com a sessão do usuário — grant ali seria superfície morta.
revoke execute on function public.fn_podar_event_log(int, int)
  from public, anon, authenticated;
grant execute on function public.fn_podar_event_log(int, int) to service_role;

-- O COMMENT dizia só o que a tabela É. Passa a dizer também quanto tempo ela
-- guarda e quem a poda — afirmação de estado que envelhece vira ponteiro.
comment on table public.event_log is
  'Bus interno do CRM. Triggers e ServerActions inserem aqui via emit_event(). Workers consomem. '
  'Retenção default de 120 dias para linhas done/dead, podadas por public.fn_podar_event_log '
  '(piso de 90 dias, que é a janela máxima das telas de IA) a partir do cron '
  'app/api/v1/cron/data-retention. pending e processing nunca são apagados.';

notify pgrst, 'reload schema';
