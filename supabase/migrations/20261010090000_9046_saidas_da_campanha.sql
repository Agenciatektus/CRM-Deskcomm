-- manifest: 9046 — o operador escolhe QUANDO A RÉGUA DA CAMPANHA PARA de falar com uma pessoa: `campaigns.saidas` (jsonb, nulo = o padrão de sempre) guarda etiquetas, etapas do funil, "negócio ganho ou perdido" e "alguém do time assumiu" no MESMO vocabulário que `lib/cadencia/saidas.ts` já executa, e `politicaDaRegua` passa a publicá-las em `followup_flow_pointers.cadence_settings` no lugar do literal fixo que tinha no código. Por quê: os desfechos já existiam e funcionavam, mas eram DERIVADOS com valores fixos — a campanha não tinha onde dizer "pare quando o card entrar em Fechamento" ou "pare quando ganhar a etiqueta Reunião agendada". Sem motor novo e sem desfecho novo: é configuração e tela. Nulo lê como `{etiquetas: [], etapas: [], ao_fechar: true, humano_assumir: true}`, que é byte a byte o literal anterior, então nenhuma campanha existente muda de comportamento. Jsonb que o Zod não lê NÃO vira padrão: recusa o SALVAR, barra o gate de `faltaParaEnviar` e recusa a publicação da régua (falha fechada; o inverso mandaria abordagem de prospecção para quem o operador já tinha mandado parar de receber).
--
-- 9046 — QUANDO A RÉGUA DA CAMPANHA PARA (configuração, não motor)
--
-- ## O que já existia, e o que falta
--
-- `lib/cadencia/saidas.ts` já sabe parar uma régua de prospecção por seis
-- desfechos: negócio ganho, negócio perdido, negócio removido, etapa do funil,
-- etiqueta e "uma pessoa do time assumiu a conversa". A resposta do lead encerra
-- por fora disso (`cancel_on_reply`, `lib/followup/reactivity.ts`). Dois
-- consumidores aplicam a mesma função pura: `saidas.handler.ts`, que reage ao
-- evento, e `followup-turn.ts`, que reconfere antes de CADA envio.
--
-- Nada disso é novo aqui, e nada disso muda. O que faltava era o OPERADOR
-- escolher: `lib/campanhas/regua-politica.ts` derivava as saídas da campanha com
-- o literal
--
--     saidas: { etiquetas: [], etapas: [], ao_fechar: true, humano_assumir: true }
--
-- escrito no código, e a campanha não tinha coluna, rota nem tela para dizer
-- outra coisa. Uma campanha de prospecção de um cliente que trabalha com
-- «Reunião agendada» continuava insistindo com quem já tinha reunião marcada,
-- porque etiqueta de saída era uma lista vazia que ninguém podia preencher.
--
-- ## Por que uma coluna, e por que `jsonb` nulo
--
-- O destino do valor é `followup_flow_pointers.cadence_settings.saidas`, que já
-- é jsonb com este formato exato (schema `saidasDaCadenciaSchema`). Uma coluna
-- com a mesma forma é cópia de um formato que já existe, e não formato novo:
-- publicar é `saidas: <a coluna>` em vez de `saidas: <o literal>`.
--
-- NULO é o estado "o operador nunca abriu esta seção", e é ele que preserva o
-- comportamento: `lerSaidasDaCampanha(null)` devolve o padrão, que é o literal
-- antigo. Gravar o objeto do padrão como default da coluna daria o MESMO
-- comportamento e perderia a distinção — e com ela a resposta a "esta campanha
-- foi configurada, ou herdou?" na hora de auditar por que alguém parou de
-- receber. Por isso não há `not null default`.
--
-- ## O CHECK é raso DE PROPÓSITO, e quem fecha é o lado de cima
--
-- Só `jsonb_typeof(saidas) = 'object'`. Não há função `immutable` com
-- `jsonb_array_elements` como na 9034 e na 9037, e a razão é a direção da falha:
-- ali o CHECK era a segunda tranca de um valor que o worker lê e EXECUTA direto
-- (`passos` vira grafo publicado), então um elemento mal formado tinha de parar
-- no banco. Aqui o valor é lido por `lerSaidasDaCampanha`, que recusa qualquer
-- coisa que o Zod não aceite — e a recusa PARA a régua em três lugares:
--
--   1. `saidas` no Zod da rota (`criarCampanhaSchema`/`editarCampanhaSchema`):
--      o jsonb ilegível não nasce pela porta do produto;
--   2. `problemaNasSaidas` no gate de `faltaParaEnviar`: preparar, iniciar,
--      agendar e testar são recusados com a frase que o operador lê;
--   3. `politicaDaRegua` devolve recusa em vez de política, e
--      `publicarReguaDaCampanha` para antes de qualquer escrita no pointer.
--
-- Um CHECK mais fundo recusaria o INSERT pela PostgREST com service_role, que é
-- a mesma coisa que o item 1 já cobre para a porta real, e cobraria o preço de
-- uma função a mais no banco para enriquecer um 23514 que a tela mostra como
-- "internal_error". O que o CHECK raso garante é o que importa para o banco:
-- ninguém grava um array ou uma string onde o código espera objeto.
--
-- ## A régua QUE JÁ ESTÁ NO AR não é alcançada por esta coluna
--
-- O motor executa `followup_flow_pointers.cadence_settings`, o snapshot da
-- publicação. Esta coluna é a INTENÇÃO, e ela chega ao motor só quando a
-- campanha é preparada ou iniciada de novo. Duas consequências, as duas
-- desejadas: (a) corromper a linha de `campaigns` não enfraquece a régua viva,
-- porque ela não é lida; (b) mudar a configuração não muda a régua viva, e por
-- isso `saidas` é CONTEÚDO no PATCH (só rascunho), e não ritmo — aceitá-la com a
-- campanha andando deixaria a tela mostrando uma política e o pointer
-- executando outra.
--
-- ## O que NÃO muda
--
-- `lib/cadencia/saidas.ts` não é tocado: nenhum desfecho novo, nenhuma mudança
-- em `motivoDeSaida`, nenhum campo novo em `FatosDaSaida`. As cadências que
-- param hoje param exatamente pelos mesmos motivos. O teto de 20 passos, o
-- anti-laço de 30 dias, o teto do dia, os vetos por bloqueio, anonimização e
-- recusa de marketing e a supressão por telefone seguem inteiros: esta migration
-- não toca em nenhum deles.
--
-- ## ANTES DO DEPLOY: a coluna nasce vazia em toda campanha
--
-- Aditiva, sem backfill e sem reinterpretar dado existente. A contagem abaixo é
-- a confirmação de que não existe campanha "já configurada" (não poderia: a
-- coluna não existe):
--
--   select count(*) as campanhas,
--          count(*) filter (where passos <> '[]'::jsonb) as com_regua
--     from public.campaigns;
--
-- `com_regua` é quantas campanhas passam a ter a seção com efeito prático —
-- campanha sem passos não publica régua nenhuma, então para ela a configuração
-- fica guardada e inerte até ganhar passos.
--
-- ## Idempotente
--
-- Coluna com `if not exists`, CHECK com guarda em `pg_constraint` (nunca
-- drop+add, que deixaria a tabela sem a constraint se o update morresse no
-- meio). Nenhuma função criada, então este bloco não tem restrição de posição em
-- relação à VARREDURA anon do baseline.

set local lock_timeout = '3s';

alter table public.campaigns
  add column if not exists saidas jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaigns_saidas_validas'
       and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_saidas_validas
      check (saidas is null or jsonb_typeof(saidas) = 'object');
  end if;
end $$;

comment on column public.campaigns.saidas is
  'Quando a régua da campanha PARA de falar com uma pessoa, no vocabulário de '
  'cadence_settings.saidas: {etiquetas: text[], etapas: uuid[], ao_fechar: bool, '
  'humano_assumir: bool}. NULL = o operador nunca escolheu, e vale o padrão '
  '{[], [], true, true} — byte a byte o literal que lib/campanhas/regua-politica.ts '
  'publicava antes da 9046, então campanha existente não muda de comportamento. '
  'Publicada em followup_flow_pointers.cadence_settings ao preparar/iniciar; a régua '
  'no ar segue o SNAPSHOT, não esta coluna. Jsonb que o Zod de saidasDaCadenciaSchema '
  'não lê PARA a régua (recusa no salvar, no gate de faltaParaEnviar e na publicação), '
  'nunca cai no padrão. Migration 9046.';

notify pgrst, 'reload schema';
