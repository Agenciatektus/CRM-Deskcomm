-- 9009 — o envelope cifrado das senhas não é para todo membro da organização.
--
-- ─── O defeito ──────────────────────────────────────────────────────────────
-- `voip_trunk_settings` (0349) e `external_db_connections` (0372) guardam
-- senha em envelope AES-GCM: `password_encrypted` + `password_iv` +
-- `password_tag`. As duas migrations fazem `revoke all ... from anon` e param
-- aí — e o cabeçalho da 0349 declara, em letras, que "só `password_last4` é
-- exposto pela view segura".
--
-- Só que o baseline tem, muito antes:
--
--   ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "authenticated"
--
-- Toda tabela nova nasce concedida a `authenticated` TAMBÉM. Revogar de `anon`
-- fecha uma porta e deixa a outra escancarada: qualquer `viewer` ou `agent` da
-- organização pede
--
--   GET /rest/v1/voip_trunk_settings?select=password_encrypted,password_iv,password_tag
--
-- e leva o envelope completo. A RLS deixa passar: ele é da organização.
--
-- ─── Calibrando o tamanho disto, com honestidade ────────────────────────────
-- É ciphertext, e a chave de decifragem fica no servidor, fora do alcance do
-- PostgREST. Ninguém sai daqui com a senha em claro. O que se perde é o desenho
-- declarado, o least privilege, e a margem para o dia em que a chave vazar —
-- nesse dia, quem tiver guardado o envelope decifra em casa, sem tocar no
-- sistema de novo. Por isso isto se conserta agora e não vira P0.
--
-- ─── O padrão certo já existe nesta base ────────────────────────────────────
-- `ai_provider_credentials` faz exatamente o que estas duas deveriam: revoga o
-- `select` inteiro e devolve um `select` POR COLUNA, deixando as colunas do
-- segredo de fora. As views `_safe` são `security_invoker` e continuam
-- funcionando, porque elas leem as colunas que permanecem concedidas.

do $$
begin
  if to_regclass('public.voip_trunk_settings') is not null then
    revoke select on public.voip_trunk_settings from authenticated, anon;
    -- Tudo menos `password_encrypted`, `password_iv` e `password_tag`.
    -- `password_last4` FICA: é o que a tela mostra para a pessoa reconhecer
    -- qual senha está lá sem poder reconstruí-la.
    grant select (
      organization_id, host, port, username, password_last4,
      from_domain, endpoint_name, is_active, updated_by, created_at, updated_at
    ) on public.voip_trunk_settings to authenticated;
  end if;

  if to_regclass('public.external_db_connections') is not null then
    revoke select on public.external_db_connections from authenticated, anon;
    grant select (
      id, organization_id, label, host, port, database_name, username,
      ssl_mode, enabled, last_tested_at, last_test_ok, last_test_error,
      created_by, created_at, updated_at
    ) on public.external_db_connections to authenticated;
  end if;
end $$;

-- `phone_numbers` ficou sem o `revoke ... from anon` que todas as irmãs dela do
-- lote têm. Na prática a RLS barra o anônimo de qualquer jeito — mas defesa em
-- profundidade é exatamente ter a segunda tranca quando a primeira já segura.
do $$
begin
  if to_regclass('public.phone_numbers') is not null then
    revoke all on public.phone_numbers from anon;
  end if;
end $$;

notify pgrst, 'reload schema';
