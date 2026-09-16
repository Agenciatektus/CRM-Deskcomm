-- 9001_canal_verdash_vocabulario
--
-- Provider nativo `verdash`: o CRM fala com a instância de WhatsApp que o cliente
-- já tem na Verdash (FZAP), usando o token DAQUELA instância — não um adminToken
-- global. É a diferença entre cada organização carregar a própria credencial e
-- uma chave mestra do servidor inteiro viajar no .env do CRM.
--
-- Numeração: a faixa `9xxx` é reservada às migrations DO FORK. A sequência do
-- upstream (hoje em 0238) não a alcança, então merge com o upstream não colide
-- mais no número — o que já custou uma renumeração no 0232.
--
-- Os dois CHECK são reescritos de forma ADITIVA: a definição atual é lida de
-- `pg_get_constraintdef` e recebe o ramo do verdash em `or`. Assim a migration
-- não precisa saber quantos providers existem hoje (são quatro: waha,
-- meta_cloud, zernio, wacalls) nem apagar um provider que o upstream venha a
-- acrescentar depois.

-- 1. colunas de identidade e credencial do provider
alter table public.channel_sessions
  add column if not exists verdash_instance_name text,
  add column if not exists verdash_token_encrypted bytea;

comment on column public.channel_sessions.verdash_instance_name is
  'Nome da instância na Verdash/FZAP que esta sessão representa (ex.: tektus-dr-paulo-torres).';
comment on column public.channel_sessions.verdash_token_encrypted is
  'Token da instância, cifrado por fn_encrypt_oauth. Escopo: APENAS esta instância — nunca o adminToken global do FZAP.';

-- 2. vocabulário de provider (aditivo)
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.channel_sessions'::regclass
    and conname  = 'channel_sessions_provider_check';

  if def is null then
    -- tabela sem o CHECK (instalação fora do baseline): cria com o vocabulário conhecido
    alter table public.channel_sessions
      add constraint channel_sessions_provider_check
      check (provider = any (array['waha', 'meta_cloud', 'zernio', 'wacalls', 'verdash']));
  elsif position('verdash' in def) = 0 then
    -- def vem como "CHECK ((<corpo>))"; preserva o corpo e acrescenta o ramo
    def := regexp_replace(def, '^CHECK\s*\(', '');
    def := left(def, length(def) - 1);
    alter table public.channel_sessions drop constraint channel_sessions_provider_check;
    execute format(
      'alter table public.channel_sessions add constraint channel_sessions_provider_check check (%s or (provider = %L))',
      def, 'verdash'
    );
  end if;
end $$;

-- 3. coluna de identidade obrigatória por provider (aditivo)
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.channel_sessions'::regclass
    and conname  = 'channel_sessions_provider_ref_check';

  if def is null then
    alter table public.channel_sessions
      add constraint channel_sessions_provider_ref_check
      check (
        ((provider = 'waha')       and (waha_session_name      is not null))
        or ((provider = 'meta_cloud') and (meta_phone_number_id is not null))
        or ((provider = 'zernio')     and (zernio_account_id    is not null))
        or ((provider = 'wacalls')    and (wacalls_session_id   is not null))
        or ((provider = 'verdash')    and (verdash_instance_name is not null))
      );
  elsif position('verdash' in def) = 0 then
    def := regexp_replace(def, '^CHECK\s*\(', '');
    def := left(def, length(def) - 1);
    alter table public.channel_sessions drop constraint channel_sessions_provider_ref_check;
    execute format(
      'alter table public.channel_sessions add constraint channel_sessions_provider_ref_check check (%s or ((provider = %L) and (verdash_instance_name is not null)))',
      def, 'verdash'
    );
  end if;
end $$;

-- 4. uma instância da Verdash não pode ser reivindicada por duas organizações
create unique index if not exists channel_sessions_verdash_instance_unique
  on public.channel_sessions (verdash_instance_name)
  where provider = 'verdash' and archived_at is null;
