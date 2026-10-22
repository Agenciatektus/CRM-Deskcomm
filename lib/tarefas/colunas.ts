/**
 * As colunas que as rotas de tarefa devolvem — UMA lista para as quatro rotas
 * (`tasks`, `tasks/[id]`, `tasks/bulk` e a criação), explícita para o
 * `select *` não vazar coluna nova.
 *
 * Os embutidos dizem DE QUEM é a tarefa sem uma consulta por linha: o negócio
 * com o funil e a etapa ("Lead: Nome · Funil", e o quadro onde o dossiê abre)
 * e o contato (a tarefa presa só a ele). Os nomes das chaves estrangeiras vão
 * explícitos porque `crm_leads` tem DUAS para `crm_stages` (`stage_id` e
 * `lost_from_stage_id`): sem a dica o PostgREST recusa o embutido como ambíguo.
 *
 * Medido em produção (22/10/2026, como `authenticated`): os embutidos não
 * mudam o tempo da consulta — quem custa é a policy de `crm_tasks`.
 */
export const COLUNAS_DA_TAREFA =
  "id, organization_id, title, description, due_date, priority, status, lead_id, contact_id, demanda_id, assigned_to, created_by, created_at, updated_at, " +
  "lead:crm_leads(id, title, pipeline_id, stage_id, funil:crm_pipelines!crm_leads_pipeline_id_fkey(id, name), etapa:crm_stages!crm_leads_stage_id_fkey(id, name)), " +
  "contato:contacts!crm_tasks_contact_id_fkey(id, display_name)";
