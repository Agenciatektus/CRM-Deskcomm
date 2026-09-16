-- 9002_arquivo_de_webhook_conhece_verdash
--
-- Forward-fix da 9001: `webhook_events_log` tem o SEU PRÓPRIO vocabulário de
-- provider, e ele não conhecia o canal novo.
--
-- ─── Como isso apareceu, e por que é o tipo de defeito que se esconde ───────
--
-- A 9001 abriu `channel_sessions` para o provider novo e o canal passou a
-- funcionar: conecta, envia, recebe. Mas a rota de entrada ARQUIVA o corpo cru
-- de todo webhook antes de processá-lo — e esse insert é best-effort, de
-- propósito, para que uma falha de arquivo nunca derrube a ingestão de uma
-- mensagem de cliente.
--
-- O resultado é a pior combinação para quem depura: o canal funciona, nada
-- falha visivelmente, e o log da aplicação repete em silêncio
--
--   new row for relation "webhook_events_log" violates check constraint
--   "webhook_events_log_provider_check"
--
-- Ou seja: o ÚNICO instrumento para investigar "o cliente respondeu e não
-- chegou" estava desligado exatamente para o canal mais novo — aquele em que
-- mais se vai precisar dele.
--
-- Medido em produção logo depois de conectar o primeiro número: 5 entregas de
-- teste, 5 warnings, ZERO linhas arquivadas.
--
-- A lição que fica é a regra da casa, e ela existe porque isto reincide:
-- tabela diferente não herda o vocabulário da vizinha. Conferir os CHECK de
-- `channel_sessions` e presumir que o arquivo acompanha é o mesmo atalho que
-- `matriz_tintim.telefone_e164` já custou caro.
--
-- Aditiva pelo mesmo motivo da 9001: a definição atual é derivada de
-- `pg_get_constraintdef` em vez de reescrita, para que um provider que o
-- upstream acrescente não desapareça no próximo merge.

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.webhook_events_log'::regclass
    and conname  = 'webhook_events_log_provider_check';

  if def is null then
    -- Tabela sem o CHECK (instalação fora do baseline): cria com o vocabulário
    -- conhecido, incluindo o canal novo.
    alter table public.webhook_events_log
      add constraint webhook_events_log_provider_check
      check (provider = any (array['waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'verdash']));
  elsif position('verdash' in def) = 0 then
    -- def vem como "CHECK ((<corpo>))"; preserva o corpo e acrescenta o ramo.
    def := regexp_replace(def, '^CHECK\s*\(', '');
    def := left(def, length(def) - 1);
    alter table public.webhook_events_log drop constraint webhook_events_log_provider_check;
    execute format(
      'alter table public.webhook_events_log add constraint webhook_events_log_provider_check check (%s or (provider = %L))',
      def, 'verdash'
    );
  end if;
end $$;
