-- 9041: o contato ganha OBSERVAÇÕES, a anotação livre que a atendente pediu.
--
-- ## Por quê
--
-- Pedido da operação: um lugar para escrever o que a equipe precisa saber da
-- pessoa ("prefere ser chamada à tarde", "já comprou na loja física") e que não
-- cabe em campo personalizado do funil nem em nota de conversa (a nota é da
-- CONVERSA; a observação é do CONTATO e atravessa todas as conversas dele). O
-- botão "Obs" do cabeçalho do painel do lead estava desabilitado com "Em breve"
-- justamente porque esta coluna não existia.
--
-- ## Forma
--
-- `contacts.observacoes text`, nula por padrão. O CHECK `contacts_observacoes_tamanho`
-- limita a 4000 caracteres e recusa texto só de espaços: a rota (PATCH de
-- contatos) já faz trim e transforma vazio em null, e o banco garante o mesmo
-- para qualquer outra porta (PostgREST direto, MCP). Teto de tamanho porque a
-- ficha do contato é lida inteira pelo GET e pelo painel; sem teto, um cliente
-- da API gravaria megabytes numa coluna que toda abertura de conversa traz.
-- `NOT VALID` pelo mesmo motivo da 9033: a coluna nasce vazia (nada a validar)
-- e validar varreria `contacts` segurando o lock da tabela; a regra vale para
-- toda escrita a partir daqui.
--
-- ## RLS e grants
--
-- Nada muda: a coluna herda as policies POR COMANDO da 9030 (`contacts_select`
-- para membro da organização; insert/update/delete só agent+) e o GRANT de
-- tabela. Viewer lê, não escreve; outra organização não vê a linha; anon não
-- tem policy. A rota barra ainda suporte em modo somente leitura
-- (`requireSupportWrite`) e audita só o NOME do campo alterado, nunca o texto.
--
-- ## LGPD
--
-- Observação livre sobre uma pessoa é dado pessoal. A anonimização (irreversível,
-- L-04) passa por UPDATE de `is_anonymized` em toda porta; a trigger abaixo apaga
-- a observação nesse momento, no mesmo desenho de
-- `trg_contacts_anonimizado_limpa_custom_fields` (0211). Assim nenhuma das
-- funções grandes da cascata precisou ser copiada e reescrita.
--
-- Prova: tests/invariants/obs-do-contato-9041.test.ts.

set local lock_timeout = '3s';

alter table public.contacts add column if not exists observacoes text;

comment on column public.contacts.observacoes is
  'Observações livres da equipe sobre o contato (até 4000 caracteres; null = sem observação). Escrita pelo PATCH /api/v1/contacts/[id], agent+; o audit guarda só que mudou. Apagada na anonimização (trg_contacts_anonimizado_limpa_observacoes). Migration 9041.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'contacts_observacoes_tamanho'
       and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_observacoes_tamanho
      check (observacoes is null or (char_length(observacoes) <= 4000 and btrim(observacoes) <> ''))
      not valid;
  end if;
end $$;

create or replace function public.fn_contato_anonimizado_limpa_observacoes()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  -- Anonimização é irreversível (L-04): não há o que preservar aqui.
  new.observacoes := null;
  return new;
end$$;

-- As DUAS origens de EXECUTE (item 9 do CLAUDE.md): `revoke from public` não
-- remove um grant nominal a `anon` vindo do default ACL.
revoke all on function public.fn_contato_anonimizado_limpa_observacoes() from public, anon, authenticated;

drop trigger if exists trg_contacts_anonimizado_limpa_observacoes on public.contacts;
create trigger trg_contacts_anonimizado_limpa_observacoes
  before update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized = true and coalesce(old.is_anonymized, false) = false)
  execute function public.fn_contato_anonimizado_limpa_observacoes();

-- Fusão de contatos: o principal mantém a PRÓPRIA observação e, só quando não
-- tem nenhuma, herda a do absorvido (sem concatenar). Por trigger no FATO
-- (`is_merged_into` saiu de null), e não reescrevendo `fn_mesclar_contatos`
-- (300 linhas, remendada por âncora na 9010): qualquer porta que mescle herda.
-- Com vários absorvidos, o primeiro que o UPDATE da fusão alcança e tem
-- observação vence; os demais encontram o principal já preenchido.
-- O absorvido fica SEM observação, herdada ou não (P2 do @Cassio_SecRev): a
-- anonimização do principal não alcança as lápides (`is_merged_into`), então
-- uma cópia ali sobreviveria ao "esquecer" do titular. BEFORE para zerar a
-- própria linha sem um segundo UPDATE.
create or replace function public.fn_fusao_herda_observacoes()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  update public.contacts c
     set observacoes = new.observacoes
   where c.id = new.is_merged_into
     and c.organization_id = new.organization_id
     and c.observacoes is null
     and c.is_anonymized = false;
  new.observacoes := null;
  return new;
end$$;

revoke all on function public.fn_fusao_herda_observacoes() from public, anon, authenticated;

drop trigger if exists trg_contacts_fusao_herda_observacoes on public.contacts;
create trigger trg_contacts_fusao_herda_observacoes
  before update of is_merged_into on public.contacts
  for each row
  when (old.is_merged_into is null and new.is_merged_into is not null and new.observacoes is not null)
  execute function public.fn_fusao_herda_observacoes();

notify pgrst, 'reload schema';
