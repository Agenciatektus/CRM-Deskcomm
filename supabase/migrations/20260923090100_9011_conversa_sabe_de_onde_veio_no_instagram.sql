-- 9011 — a conversa do Instagram diz POR ONDE ela entrou, e o Inbox filtra por isso.
--
-- ─── A decisão de produto que esta coluna serve ─────────────────────────────
-- Comentário NÃO vira lead — quem comenta "que lindo" num post não pediu
-- atendimento, e virar card encheria o Kanban de ruído para o vendedor limpar à
-- mão. Mas comentário APARECE no Inbox, filtrável, porque alguém (pessoa ou IA)
-- precisa responder.
--
-- Isso só é possível porque conversa e lead são entidades SEPARADAS neste
-- schema: dá para ter uma sem a outra. `garantirLeadDaConversa` é chamada para
-- Direct e não é chamada para comentário, e o resto do produto não precisa
-- saber da diferença.
--
-- ─── Por que a entrada mora na CONVERSA e não só na mensagem ────────────────
-- Porque quem filtra é o Inbox, e o Inbox lista CONVERSAS. Guardar isto apenas
-- em `messages.metadata` obrigaria o filtro a varrer mensagem para decidir o
-- que mostrar — e um filtro que faz subconsulta por linha é um filtro que o
-- atendente desliga por lentidão.
--
-- ─── E por que `story` NÃO é um valor aqui ─────────────────────────────────
-- Uma resposta a story é um Direct: ela cai na MESMA conversa de DM, e a pessoa
-- segue conversando ali. Se `story` fosse valor de conversa, a segunda mensagem
-- da mesma pessoa (já sem story) teria de mudar o valor da linha ou abrir uma
-- conversa nova — as duas saídas erradas. A origem de CADA mensagem fica em
-- `messages.metadata.instagram_entrada`, onde `story` faz sentido e não precisa
-- ser estável.
--
-- O CHECK aceita só o que o produto trata. Um valor novo vindo do futuro é erro
-- de escrita, e erro de escrita aqui é melhor que uma conversa que o Inbox não
-- sabe classificar e simplesmente não mostra.

alter table public.conversations
  add column if not exists instagram_entrada text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_instagram_entrada_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_instagram_entrada_check
      check (instagram_entrada is null or instagram_entrada in ('direct', 'comentario'));
  end if;
end $$;

-- O índice do filtro. Parcial porque só conversa de Instagram tem o valor, e um
-- índice sobre a coluna inteira carregaria as 158 conversas de WhatsApp (e as
-- que vierem) para responder uma pergunta que só é feita sobre Instagram.
create index if not exists conversations_instagram_entrada_idx
  on public.conversations (organization_id, instagram_entrada, last_message_at desc)
  where instagram_entrada is not null;

comment on column public.conversations.instagram_entrada is
  'Por onde a conversa entrou: `direct` (inclui resposta a story) ou `comentario`. É o que o filtro do Inbox usa. Comentário não gera lead.';

notify pgrst, 'reload schema';
