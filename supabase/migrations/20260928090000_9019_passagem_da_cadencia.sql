-- 9019 — O VOCABULÁRIO DA PASSAGEM GANHA A CADÊNCIA.
--
-- Quando o lead responde à cadência e a conversa vai para uma pessoa, quando a
-- IA da cadência leva o negócio até a etapa-alvo e quando ela para de conduzir
-- (teto de turnos, agente indisponível), a passagem vira linha em
-- `passagens_de_atendimento` como toda outra. Sem estes valores o INSERT
-- bateria em 23514 e a passagem sumiria em silêncio.
--
--   origem        += 'cadencia'
--   motivo_codigo += 'cadencia_lead_respondeu', 'objetivo_atingido', 'cadencia_ia_encerrou'
--
-- Par TypeScript: `lib/escalacao/passagem.ts` (ORIGENS_DA_PASSAGEM,
-- MOTIVOS_DA_PASSAGEM), vigiado por
-- tests/invariants/vocabulario-banco-x-typescript.test.ts.
--
-- No baseline NÃO há bloco novo: o bloco único de cada constraint (0291/0293)
-- foi editado com o vocabulário final (#159, uma constraint, um bloco).
-- Só amplia: toda linha existente continua válida. Idempotente.

alter table public.passagens_de_atendimento
  drop constraint if exists passagens_de_atendimento_origem_check;
alter table public.passagens_de_atendimento
  add constraint passagens_de_atendimento_origem_check
  check (origem in (
    'pedido_explicito','opt_out_provavel','ferramenta_do_modelo',
    'teto_de_gasto','caso_escalado','sentimento','legado_pedido',
    'legado_juridico','legado_etapa','legado_confianca','legado_teto',
    'mcp_externo','runtime_nativo',
    'cadencia'));

alter table public.passagens_de_atendimento
  drop constraint if exists passagens_de_atendimento_motivo_codigo_check;
alter table public.passagens_de_atendimento
  add constraint passagens_de_atendimento_motivo_codigo_check
  check (motivo_codigo in (
    'requested_human','suspected_optout','orcamento_de_ia','low_sentiment',
    'low_confidence','critical_stage','legal_mention','refund_mention',
    'caso_escalado',
    'cadencia_lead_respondeu','objetivo_atingido','cadencia_ia_encerrou'));
