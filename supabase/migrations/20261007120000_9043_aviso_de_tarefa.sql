-- manifest: 9043 — `crm_tasks.reminded_at` (timestamptz, nula) + índice parcial das tarefas abertas a avisar + kind `task_due` na Central. Por quê: o "Próximo passo" virou tarefa com prazo e responsável, e nada lia `crm_tasks.due_date` — o prazo vencia em silêncio. O cron `task-due-reminder` avisa o responsável na hora (Central de avisos + push do navegador) e carimba aqui que avisou; reagendar zera o carimbo.
--
-- 9043 — O RESPONSÁVEL É AVISADO NA HORA DA TAREFA
--
-- ## Por quê
--
-- O painel do lead passou a criar o próximo passo como tarefa (`crm_tasks`,
-- com `due_date` e `assigned_to`), e a tela prometia só "entra na lista de
-- Tarefas" porque nenhum job lia o prazo. O único lembrete que existia era o
-- da Agenda, e ele fala com o CLIENTE pelo WhatsApp — não com a equipe.
-- Decisão do Peterson (06/10/2026): avisar pelo sino do CRM (Central de avisos)
-- e pelo push do navegador que o CRM já tem. Sem WhatsApp.
--
-- ## O que muda
--
-- 1. `crm_tasks.reminded_at` — quando o aviso saiu. Nula = ainda não avisou.
--    O cron reivindica a tarefa com um UPDATE condicional
--    (`... where id = $1 and reminded_at is null returning id`): duas réplicas
--    na mesma batida disputam a MESMA linha e só uma recebe a linha de volta.
--    Carimba a TENTATIVA, como o lembrete da Agenda: se o push falhar, a
--    tarefa não volta a apitar a cada minuto. Reagendar (PATCH com
--    `due_date`) zera o carimbo, e o aviso sai de novo no prazo novo.
--
--    Por que uma coluna e não "já existe aviso na Central para esta tarefa":
--    o aviso da Central aponta para a CONVERSA ou o negócio (é para lá que o
--    botão leva), não para a tarefa; e reagendar precisa re-armar o aviso, o
--    que pede um estado da TAREFA, não do aviso.
--
-- 2. Índice parcial que cobre exatamente a varredura (abertas, com prazo,
--    ainda não avisadas): a tabela cresce com tarefa concluída, e a consulta
--    de cada minuto só quer a ponta viva.
--
-- 3. Kind `task_due` em `agent_inbox_items_kind_check`. Um kind próprio, e não
--    `other`: a Central dá rótulo e destino por kind (lib/ai/inbox-destino.ts),
--    e o rótulo de `other` é "Aviso do assistente" — falso para uma tarefa que
--    uma pessoa marcou. O push sai SÓ para o responsável, direto do cron;
--    `task_due` não está em `somDoAviso`, então o `central.aviso_criado` (0442)
--    NÃO o manda para a organização inteira.
--
--    A LISTA VEM INTEIRA, derivada do `supabase/baseline.sql` no momento do
--    commit (a da 0500 + `task_due` antes de `other`): `add constraint`
--    substitui, e uma lista parcial apagaria o aviso de outra feature em
--    silêncio (tests/unit/kind-check-migration-x-baseline.test.ts).
--
-- Aditiva, sem backfill: no primeiro deploy toda tarefa tem `reminded_at`
-- nula, e é o cron que limita a enxurrada (só avisa prazo vencido há até 24h).
-- Idempotente. O mesmo texto está no apêndice do `supabase/baseline.sql`.

set local lock_timeout = '3s';

alter table public.crm_tasks
  add column if not exists reminded_at timestamptz;

comment on column public.crm_tasks.reminded_at is
  'Quando o responsável foi avisado do prazo (Central + push, cron task-due-reminder). NULL = ainda não avisou. Reagendar (PATCH due_date) zera. Migration 9043.';

create index if not exists crm_tasks_a_avisar_idx
  on public.crm_tasks (due_date)
  where reminded_at is null
    and due_date is not null
    and status in ('pending', 'in_progress');

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'proposta_travada',
    'proposta_pronta_para_revisao',
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    'task_due',
    'other'
));

notify pgrst, 'reload schema';
