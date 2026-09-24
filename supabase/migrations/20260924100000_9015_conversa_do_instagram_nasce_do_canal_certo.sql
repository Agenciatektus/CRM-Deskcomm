-- 9015 — a conversa do Instagram nasce no canal certo
--
-- ─── O QUE FALTAVA ─────────────────────────────────────────────────────────
--
-- `fn_upsert_wa_conversation` grava `channel` como 'whatsapp' LITERAL. Ela é a
-- única porta atômica para criar conversa a partir de webhook, e a ingestão do
-- Instagram não podia usá-la: a conversa nasceria marcada como WhatsApp, e a
-- mentira se espalharia para o ícone do Inbox, para `capabilitiesOf()` (que
-- passaria a prometer janela de 24h e mídia que o Instagram não tem) e para o
-- filtro por canal.
--
-- ─── POR QUE UMA FUNÇÃO E NÃO UM UPSERT NO TYPESCRIPT ──────────────────────
--
-- Porque duas entregas simultâneas da mesma pessoa criariam duas conversas. A
-- RPC irmã resolve essa corrida dentro de UMA instrução, e o comentário dela
-- diz o motivo com todas as letras: escrever um segundo upsert seria criar um
-- segundo lugar onde a mesma corrida pode voltar. Repetir a lógica no cliente
-- seria repetir também o defeito.
--
-- ─── POR QUE NÃO GENERALIZEI A FUNÇÃO EXISTENTE ────────────────────────────
--
-- Acrescentar `p_canal` a `fn_upsert_wa_conversation` mudaria a assinatura de
-- quem já roda em produção para todo o WhatsApp. O ganho seria ter uma função
-- em vez de duas; o risco é o caminho de ingestão mais movimentado do produto.
-- Quando existir um terceiro canal, as duas viram uma — com o Instagram já
-- estável, e não no mesmo passo em que ele nasce.
--
-- ─── A DECISÃO DE PRODUTO QUE ESTA FUNÇÃO CARREGA ──────────────────────────
--
-- Direct e comentário da MESMA pessoa na MESMA conta caem na MESMA conversa.
--
-- O índice `uniq_conversations_1to1_per_contact_session` é
-- `(organization_id, contact_id, channel_session_id) where is_group = false`, e
-- separar os dois exigiria acrescentar a entrada a ELE — um índice que hoje
-- governa todo o WhatsApp em produção. Não é um risco que a chegada do
-- Instagram justifique pagar.
--
-- E o desenho sobrevive à escolha porque a informação não se perde: a COLUNA
-- diz como a conversa NASCEU (é o que o filtro do Inbox lista), e cada mensagem
-- carrega a própria entrada em `messages.metadata.instagram_entrada` — que é
-- exatamente onde a 9011 disse que ela ficaria.
--
-- `do update set updated_at = now()` e NADA MAIS, de propósito: sobrescrever
-- `instagram_entrada` no conflito faria o primeiro comentário de um cliente
-- reescrever como "comentário" uma conversa que nasceu de Direct — e o filtro
-- passaria a mentir sobre o próprio histórico que ele lista.

create or replace function public.fn_upsert_conversa_do_instagram(
  p_org uuid, p_contact uuid, p_session uuid, p_entrada text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.conversations (
    organization_id, contact_id, channel_session_id, channel, status,
    is_group, unread_count_for_assignee, metadata, instagram_entrada
  )
  values (p_org, p_contact, p_session, 'instagram', 'open', false, 0, '{}'::jsonb, p_entrada)
  on conflict (organization_id, contact_id, channel_session_id) where is_group = false
  do update set updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

-- Doutrina de migrations, regra 9: função nova em `public` nasce EXPOSTA, e são
-- DUAS origens de EXECUTE — o `GRANT ALL ON FUNCTIONS TO anon` que o baseline
-- emite como default, e o `=X` a PUBLIC. A varredura auto-curativa no fim do
-- baseline alcança esta função (ela é `security definer`), mas depender disso
-- deixaria a janela aberta entre o `create` e a varredura numa instalação nova.
--
-- Só `service_role`: quem chama é a ingestão de webhook, que roda com o cliente
-- de serviço. Sessão de usuário não tem o que fazer aqui — e se tivesse, criaria
-- conversa em nome de contato que ela talvez nem possa ver.
revoke all on function public.fn_upsert_conversa_do_instagram(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_upsert_conversa_do_instagram(uuid, uuid, uuid, text) to service_role;

-- Sem isto a função existe no banco e o PostgREST segue servindo o schema
-- velho — e a ingestão falharia com "função não encontrada" até alguém
-- reiniciar o serviço à mão, que é o passo manual que a doutrina de packaging
-- proíbe pedir a quem opera uma VPS.
notify pgrst, 'reload schema';
