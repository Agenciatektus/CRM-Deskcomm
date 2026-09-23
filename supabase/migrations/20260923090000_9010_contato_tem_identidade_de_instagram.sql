-- 9010 — o contato ganha identidade de Instagram, com a mesma dignidade do telefone.
--
-- ─── Por que uma COLUNA, e não `source_metadata` ────────────────────────────
-- O Instagram não é uma pista sobre um contato de WhatsApp: é uma FONTE DE LEAD
-- inteira. Uma pessoa pode existir só no Instagram, só no WhatsApp, ou nos dois,
-- e o desenho tem de tratar os três casos como normais.
--
-- `source_metadata` é um saco de contexto — bom para "de qual anúncio veio",
-- ruim para identidade. Identidade precisa de três coisas que JSONB não dá de
-- graça: unicidade garantida pelo banco, índice que a busca usa, e um lugar
-- óbvio onde o próximo programador procura. As três colunas de identidade que
-- já existem (`phone_number`, `email_normalized`, `cpf_hash`) são colunas com
-- índice único parcial, e esta entra na mesma prateleira.
--
-- ─── O `where is_merged_into is null` não é detalhe ─────────────────────────
-- É o que permite a FUSÃO existir. O contato perdedor vira lápide e sai do
-- índice, liberando o IGSID para o vencedor herdar. Sem o parcial, fundir dois
-- contatos que têm Instagram falharia por violação de unicidade justamente no
-- caso que a fusão existe para resolver.
--
-- ─── IGSID e @ são coisas diferentes ────────────────────────────────────────
-- O `instagram_igsid` é o id estável que a Meta dá ao par (conta, pessoa). O
-- `instagram_username` é o @, que a pessoa TROCA quando quer. Guardar os dois e
-- identificar pelo primeiro é o que evita perder o histórico de alguém que
-- mudou de @ — e é por isso que a unicidade está no IGSID, não no nome.

alter table public.contacts
  add column if not exists instagram_igsid text,
  add column if not exists instagram_username text;

create unique index if not exists contacts_instagram_igsid_key
  on public.contacts (organization_id, instagram_igsid)
  where instagram_igsid is not null and is_merged_into is null;

-- Busca por @ na tela de contatos. Não é único de propósito: dois cadastros
-- podem carregar o mesmo @ enquanto ninguém os fundiu, e recusar isso no banco
-- transformaria "a pessoa trocou de @" num erro que o atendente não sabe
-- resolver.
create index if not exists contacts_instagram_username_idx
  on public.contacts (organization_id, lower(instagram_username))
  where instagram_username is not null and is_merged_into is null;

comment on column public.contacts.instagram_igsid is
  'Id estável do par (conta, pessoa) que a Meta emite. É a identidade; o @ muda, este não.';
comment on column public.contacts.instagram_username is
  'O @ no momento da última mensagem. Para exibir e buscar — nunca para identificar.';

notify pgrst, 'reload schema';
