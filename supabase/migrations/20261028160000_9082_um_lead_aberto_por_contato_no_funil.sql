-- manifest: 9082 — indice unico parcial crm_leads_um_aberto_por_contato_no_funil em crm_leads (organization_id, contact_id, pipeline_id) where status='open' and contact_id is not null and source not in ('manual','nuvemshop','retomada') and external_id is null: um contato tem no maximo UM negocio aberto por funil vindo de origem automatica ou lote. Manual segue livre (duplicidade de proposito); nuvemshop e um card por PEDIDO (chave propria source+external_id); retomada abre card novo apontando para o perdido (retomado_de_lead_id). Indice INVALID (concurrently que falhou) da WARNING. createLeadHandler reaproveita o aberto em vez de criar. Sem duplicata existente, cria; com duplicata, avisa e nao cria (nao funde negocio de ninguem). Apendice igual no baseline.sql.
--
-- 9082: UM NEGÓCIO ABERTO POR CONTATO NO FUNIL, para o que chega sozinho.
--
-- ═══ O DEFEITO (28/10/2026, Salão Fabiana Lopes) ═══
--
-- Um contato ganhou dois negócios abertos no MESMO funil: um nasceu da conversa
-- (`whatsapp`) e o outro, 29 minutos depois, de uma carga em lote
-- (`importacao_planilha`). Duas atendentes moveram cada uma o seu card, e uma via
-- o cliente ainda em Vendas. Nada impedia o segundo: o nascimento pela conversa
-- (`fn_nascer_lead_da_conversa`) pergunta antes, mas `createLeadHandler` (REST,
-- planilha, campanha, captação, automações, prospecção, MCP) inseria direto, e o
-- único índice único de `crm_leads` além da pk era `uniq_crm_leads_org_source_external`.
--
-- ═══ O RECORTE (decisão do Peterson, 28/10/2026) ═══
--
-- `source = 'manual'` fica de fora: quem cria à mão pode abrir um segundo negócio
-- do mesmo cliente no mesmo funil de propósito (a tela já avisa, issue #1751).
-- Existe em produção um par legítimo whatsapp + manual que tem de continuar.
-- `source = 'nuvemshop'` também fica de fora: no funil de pedidos o card é o
-- PEDIDO, um por pedido, e quem compra duas vezes antes da entrega tem dois.
-- A identidade dele já é `uniq_crm_leads_org_source_external`.
-- `source = 'retomada'` também: retomar um perdido abre card NOVO que aponta
-- para ele (`retomado_de_lead_id`), mesmo com outro aberto no funil.
-- Lead COM `external_id` também fica de fora: a captação por webhook cria um
-- card POR EVENTO (idempotência por source+external_id, `uniq_crm_leads_org_source_external`),
-- e isso é contrato testado (tests/invariants/webhooks-inbound.test.ts).
-- `source` é NOT NULL (default 'manual'), então não há NULL a tratar.
-- A lista mora também em `lib/leads/negocio-aberto-duplicado.ts`
-- (`ORIGENS_FORA_DO_LEAD_UNICO`); o invariante confere que as duas não divergem.
--
-- ═══ BANCO COM DUPLICATA ═══
--
-- Fundir dois negócios abertos é decidir de quem é o histórico, e isso não é de
-- migration genérica. Se o banco já tem duplicata, o índice não nasce e sai um
-- WARNING com a contagem; o código continua reaproveitando o aberto, e o índice
-- nasce na próxima aplicação depois da limpeza. Em produção não havia: o único
-- par restante era o whatsapp + manual, fora do recorte.
--
-- Em produção, com tráfego, crie ANTES do deploy, fora de transação:
--   create unique index concurrently if not exists crm_leads_um_aberto_por_contato_no_funil
--     on public.crm_leads (organization_id, contact_id, pipeline_id)
--     where status = 'open' and contact_id is not null and source not in ('manual', 'nuvemshop', 'retomada') and external_id is null;
-- Aí esta migration fica inerte (`if not exists`). Aditiva e idempotente.
-- Reverter: drop index if exists public.crm_leads_um_aberto_por_contato_no_funil;
set lock_timeout = '3s';

do $$
declare
  v_grupos bigint;
begin
  if to_regclass('public.crm_leads_um_aberto_por_contato_no_funil') is not null then
    -- INVALID = um create concurrently que falhou no meio: existe, mas nao garante nada.
    if not (select i.indisvalid from pg_index i where i.indexrelid = 'public.crm_leads_um_aberto_por_contato_no_funil'::regclass) then
      raise warning '9082: indice crm_leads_um_aberto_por_contato_no_funil existe mas esta INVALID (create concurrently que falhou); drop index e crie de novo';
    end if;
    return;
  end if;
  select count(*) into v_grupos from (
    select 1
      from public.crm_leads
     where status = 'open' and contact_id is not null and source not in ('manual', 'nuvemshop', 'retomada') and external_id is null
     group by organization_id, contact_id, pipeline_id
    having count(*) > 1
  ) d;
  if v_grupos > 0 then
    raise warning '9082: % contato(s) com mais de um negocio aberto no mesmo funil; indice crm_leads_um_aberto_por_contato_no_funil NAO criado', v_grupos;
    return;
  end if;
  create unique index crm_leads_um_aberto_por_contato_no_funil
    on public.crm_leads (organization_id, contact_id, pipeline_id)
    where status = 'open' and contact_id is not null and source not in ('manual', 'nuvemshop', 'retomada') and external_id is null;
end $$;
