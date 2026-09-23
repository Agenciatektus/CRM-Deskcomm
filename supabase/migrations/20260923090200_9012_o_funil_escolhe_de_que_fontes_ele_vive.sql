-- 9012 — o funil declara DE QUAIS FONTES ele se alimenta, e isso governa a entrada.
--
-- ─── A decisão ─────────────────────────────────────────────────────────────
-- Decisão do Peterson: uma fonte que não está ativada em NENHUM funil não gera
-- lead nem conversa. O evento chega, é arquivado, e para ali.
--
-- Isso é mais forte do que "não vira lead, mas aparece no Inbox", e é
-- deliberado: quem não quer ver comentário no CRM não quer nem a conversa. O
-- filtro deixa de ser uma regra escrita no código da ingestão e vira
-- configuração do cliente — e a regra "comentário não vira lead" para de ser
-- uma decisão minha cravada no parser.
--
-- Com isto o cliente monta "Pacientes" com WhatsApp e Direct, e "Comentários a
-- responder" separado. Ou junta tudo. Ou desliga comentário por inteiro.
--
-- ─── O PERIGO desta migration, e como ele é desarmado ──────────────────────
-- Se esta coluna nascesse vazia, TODO funil passaria a não aceitar nada — e o
-- WhatsApp do cliente que está em produção HOJE pararia de entrar no minuto
-- seguinte ao deploy. Seria uma interrupção de atendimento causada por uma
-- migration de configuração.
--
-- Por isso o backfill marca todo funil existente com `{whatsapp}`: é EXATAMENTE
-- o que eles recebem hoje, escrito de forma explícita. Nada muda de
-- comportamento no dia do deploy; o que muda é que a partir dali dá para
-- escolher. Funil novo nasce com o mesmo default pelo `default` da coluna.
--
-- ─── Array e não tabela de junção ──────────────────────────────────────────
-- São três valores fechados, lidos sempre inteiros e sempre junto com o funil.
-- Uma tabela de junção custaria um JOIN no caminho quente da ingestão para
-- guardar o que cabe numa coluna. `crm_leads.tags` e `contacts.tags` já são
-- `text[]` nesta base — a prateleira existe.

alter table public.crm_pipelines
  add column if not exists fontes text[] not null default array['whatsapp']::text[];

-- Backfill explícito. O `default` acima só vale para linha nova; quem já existe
-- precisa ser marcado, e é este comando que garante que ninguém perca o
-- WhatsApp no deploy.
update public.crm_pipelines
   set fontes = array['whatsapp']::text[]
 where fontes is null or cardinality(fontes) = 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_pipelines_fontes_conhecidas'
      and conrelid = 'public.crm_pipelines'::regclass
  ) then
    -- Vocabulário FECHADO. Uma fonte nova exige migration, e é assim que se
    -- quer: uma string livre aqui viraria `whatsapp`, `whats`, `WhatsApp` em
    -- três instalações, e o filtro da ingestão não acharia nenhuma delas.
    alter table public.crm_pipelines
      add constraint crm_pipelines_fontes_conhecidas
      check (
        fontes <@ array['whatsapp', 'instagram_direct', 'instagram_comentario']::text[]
      );
  end if;
end $$;

-- A ingestão pergunta "existe funil desta organização que aceite esta fonte?" a
-- cada mensagem que chega. É consulta de caminho quente e precisa de índice.
create index if not exists crm_pipelines_fontes_idx
  on public.crm_pipelines using gin (fontes);

comment on column public.crm_pipelines.fontes is
  'De quais fontes este funil se alimenta. Fonte que não está em NENHUM funil da organização não gera lead nem conversa — o evento é arquivado e descartado.';

notify pgrst, 'reload schema';
