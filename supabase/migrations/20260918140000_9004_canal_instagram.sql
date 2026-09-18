-- 9004_canal_instagram
--
-- O canal Instagram aparece no CRM. Plano "Instagram como Canal", fase F8.
--
-- ─── DUAS TABELAS, DOIS VOCABULÁRIOS ────────────────────────────────────────
--
-- `channel_sessions` e `webhook_events_log` têm CHECK de `provider` SEPARADOS, com listas
-- próprias. A 9002 existe exatamente porque isso foi esquecido uma vez: o canal `verdash`
-- entrou no CHECK das sessões, funcionou (conecta, envia, recebe), e o arquivo de webhook
-- recusou 5 de 5 entregas — em silêncio, porque o insert do arquivo é best-effort de
-- propósito, para que falha de arquivo nunca derrube a mensagem de um cliente.
--
-- O efeito foi a pior combinação possível para quem depura: o instrumento que existe para
-- investigar "o cliente respondeu e não chegou" estava desligado, justamente no canal mais
-- novo, e a única evidência era um warning repetido no log da aplicação.
--
-- Esta migration mexe nas DUAS desde o primeiro dia. Não é zelo: é a lição da 9002
-- aplicada antes de o erro acontecer de novo.
--
-- ─── POR QUE PROVIDER PRÓPRIO, E NÃO UMA VARIANTE DE `verdash` ──────────────
--
-- O transporte é o mesmo (a Verdash roteia), mas as CAPACIDADES são diferentes: o
-- Instagram não manda áudio, não manda documento, e comentário não tem "digitando".
-- `capabilitiesOf()` é indexado por provider — com `instagram` dobrado dentro de
-- `verdash`, a tela ofereceria botão de áudio num canal que não aceita áudio, e o erro
-- apareceria só quando o atendente gravasse e apertasse enviar.

begin;

-- ─── 1. O CHECK DAS SESSÕES ─────────────────────────────────────────────────
--
-- Aditivo, derivando de `pg_get_constraintdef` como a 9002: quem acrescentar um provider
-- antes desta migration rodar não pode ser apagado em silêncio.
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.channel_sessions'::regclass
     and conname  = 'channel_sessions_provider_check';

  if def is null then
    alter table public.channel_sessions
      add constraint channel_sessions_provider_check
      check (provider = any (array['waha'::text,'meta_cloud'::text,'zernio'::text,'wacalls'::text,'verdash'::text,'instagram'::text]));
  elsif def not like '%''instagram''%' then
    def := regexp_replace(def, '^CHECK\s*\(', '');
    def := regexp_replace(def, '\)\s*(NOT\s+VALID\s*)?$', '', 'i');
    alter table public.channel_sessions drop constraint channel_sessions_provider_check;
    execute format(
      'alter table public.channel_sessions add constraint channel_sessions_provider_check check (%s or (provider = %L))',
      def, 'instagram'
    );
  end if;
end $$;

-- ─── 2. A COLUNA DE REFERÊNCIA ──────────────────────────────────────────────
--
-- `channel_sessions_provider_ref_check` exige que cada provider tenha a sua coluna de
-- endereçamento preenchida — é o que impede uma sessão existir sem saber para onde
-- mandar. A do Instagram é a mesma da Verdash (`verdash_instance_name`), porque o
-- transporte passa por lá; o que muda é o canal, não o caminho.
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.channel_sessions'::regclass
     and conname  = 'channel_sessions_provider_ref_check';

  if def is not null and def not like '%''instagram''%' then
    def := regexp_replace(def, '^CHECK\s*\(', '');
    def := regexp_replace(def, '\)\s*(NOT\s+VALID\s*)?$', '', 'i');
    alter table public.channel_sessions drop constraint channel_sessions_provider_ref_check;
    execute format(
      'alter table public.channel_sessions add constraint channel_sessions_provider_ref_check check (%s or (provider = %L and verdash_instance_name is not null))',
      def, 'instagram'
    );
  end if;
end $$;

-- ─── 3. O ARQUIVO DE WEBHOOK — a tabela que a 9002 ensinou a não esquecer ───
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.webhook_events_log'::regclass
     and conname  = 'webhook_events_log_provider_check';

  if def is null then
    alter table public.webhook_events_log
      add constraint webhook_events_log_provider_check
      check (provider in ('waha','nuvemshop','generic','meta_cloud','zernio','verdash','instagram'));
  elsif def not like '%''instagram''%' then
    def := regexp_replace(def, '^CHECK\s*\(', '');
    def := regexp_replace(def, '\)\s*(NOT\s+VALID\s*)?$', '', 'i');
    alter table public.webhook_events_log drop constraint webhook_events_log_provider_check;
    execute format(
      'alter table public.webhook_events_log add constraint webhook_events_log_provider_check check (%s or (provider = %L))',
      def, 'instagram'
    );
  end if;
end $$;

commit;
