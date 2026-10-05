-- 9035: o arquivo de webhook é lido só por manager+, e NINGUÉM com sessão lê o
-- corpo, os cabeçalhos nem o payload.
--
-- ## Por quê
--
-- `webhook_events_log_tenant_read` era org-flat sem gate de papel, e
-- `authenticated` tinha SELECT na tabela inteira. Qualquer `viewer` lia pelo
-- PostgREST (anon key + o JWT dele) o `raw_body`, os `headers` e o
-- `payload_parsed` de toda entrega da organização: telefone e mensagem de
-- cliente, formulário de captação com PII e, até a #98, mídia inteira. A rota
-- HTTP de eventos já exigia manager; a rota não era a única porta. Apontado na
-- revisão da #98 pelo @Cassio_SecRev.
--
-- ## O que muda
--
-- 1. A policy de leitura exige `manager` (ou platform admin): mesmo gate da
--    rota `GET /api/v1/webhook-sources/[id]/events` e do histórico de captação
--    (`webhook_lead_captures`, 0174).
-- 2. `anon` e `authenticated` perdem TODO privilégio de tabela (SELECT,
--    REFERENCES, TRIGGER e o TRUNCATE, que RLS nem enxerga). `authenticated`
--    recebe SELECT só das colunas de METADADO: sem `raw_body`, `headers` e
--    `payload_parsed`. Quem precisa do conteúdo é código de servidor com o
--    service role (arquivador, retenção, replay, script retroativo do
--    Instagram, ferramentas MCP), que não passa por grant nem por RLS.
--    `select=*` pelo PostgREST passa a dar 42501, e é o esperado.
-- 3. A rota de eventos deixa de devolver `payload_parsed`: devolve só os NOMES
--    dos campos (`campos_recebidos`), lidos com o service role e filtrados pela
--    organização. A tela nunca usou o valor.
--
-- Coluna nova nesta tabela NÃO nasce legível por sessão: precisa entrar na
-- lista de grant abaixo (e no baseline) por decisão explícita.
--
-- Prova: tests/invariants/arquivo-de-webhook-so-manager-9035.test.ts.

set local lock_timeout = '3s';

drop policy if exists "webhook_events_log_tenant_read" on public.webhook_events_log;
create policy "webhook_events_log_tenant_read" on public.webhook_events_log
  for select
  using (
    (select public.fn_is_platform_admin())
    or (organization_id is not null and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on table public.webhook_events_log from anon, authenticated;

grant select (
  id,
  organization_id,
  channel_session_id,
  provider,
  webhook_path_token,
  http_method,
  signature_header,
  valid_signature,
  event_type,
  external_id,
  status,
  attempts,
  error_message,
  processed_at,
  received_at,
  archived_at
) on table public.webhook_events_log to authenticated;

notify pgrst, 'reload schema';
