-- manifest: agente que NÃO fala com o cliente (auxiliar de CRM) pode organizar o funil em conversa já assumida por uma pessoa — a trava da passagem humana existe para proteger a FALA, e ele não fala.
-- ============================================================================
-- 2026-10-20 — 9060: O AUXILIAR DE CRM
--
-- O QUE ESTAVA ACONTECENDO
--
-- Medido na implantação da Fiorotto em 20/10/2026: um agente publicado, ativo,
-- automático, com 12 capacidades de organização e nenhuma de conversa, não
-- executou NENHUMA vez em 552 conversas. O log do drain dizia o motivo em uma
-- linha por evento: `conversa_de_humano`.
--
-- As três travas da passagem humana (`force_human`, `bot_silenced_until`,
-- `assignee_kind='user'`) existem para impedir que a IA FALE por cima de quem
-- assumiu o atendimento. Nenhuma delas descreve um risco quando o agente não
-- tem como falar: ele lê a conversa, preenche o card e move a etapa, que é
-- trabalho de retaguarda e não concorre com ninguém.
--
-- O efeito prático era o inverso do prometido: quanto mais a equipe usava o
-- CRM — distribuindo a carteira entre atendentes —, menos o auxiliar de CRM
-- funcionava. E em silêncio, porque nenhuma tela mostra esse motivo.
--
-- POR QUE UMA COLUNA, E NÃO INFERÊNCIA
--
-- Seria tentador deduzir "não fala" de `tool_ids` vazio ou da ausência de
-- `crm_send_whatsapp_message`. Não serve: a resposta do Conversador NÃO passa
-- por ferramenta nenhuma — o modelo devolve texto e o motor envia. A própria
-- tela diz isso na capacidade de envio ("o agente já envia por conta própria;
-- não há nada a ligar aqui"). Inferir transformaria um descuido de configuração
-- em permissão para atuar sobre a conversa de outra pessoa.
--
-- Então a marca é explícita, e quem a liga assume a consequência. O vocabulário
-- é o mesmo que os fluxos de atendimento já usam para a mesma ideia
-- (`flowSettingsSchema.somente_interno`, onde a publicação recusa qualquer nó
-- de envio); repetir o nome é de propósito.
-- ============================================================================

alter table public.ai_agent_versions
  add column if not exists somente_interno boolean not null default false;

comment on column public.ai_agent_versions.somente_interno is
  'Auxiliar de CRM: este agente não fala com o cliente. Libera as travas da passagem humana (conversa assumida, silenciada) porque elas protegem a fala, e veta todo envio — publicação e cadeia de guardrails. Nasce desligado.';
