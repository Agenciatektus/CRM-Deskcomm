-- manifest: 9038 — a campanha ganha um SEGUNDO modo de público: entrada CONTÍNUA por etapa do funil. `campaigns.entrada_continua` (boolean, default false) e `campaigns.entrada_etapa_id` (FK composta para `crm_stages`, `on delete set null (entrada_etapa_id)` pelo P2-3 da 9032) dizem que quem CAI na etapa escolhida é abordado por esta campanha, sem o operador montar lista. Por quê: o único modo de público era a lista fixa do snapshot, que responde "fale com estas 300 pessoas" e não responde "fale com quem chegar aqui a partir de agora" — e o funil novo chega um por vez, não em lote. Sem motor novo: o gatilho é o MESMO evento `lead.stage_changed` que `lib/followup/gatilho-etapa.ts` já consome (consumidor próprio no dispatcher, idempotência de graça pelo `consumed_by[]`), e o que o gatilho faz é inserir UMA linha em `campaign_recipients` — daí para frente o `campaign-worker` é bit a bit o mesmo caminho da lista: veto revalidado, lista de exclusão, ritmo, rodízio de números e inscrição na régua. `campaign_recipients_contato_unico` (que já existia) é o anti-repetição: card arrastado dez vezes para a etapa vira uma abordagem. O modo lista continua o DEFAULT e intacto (`entrada_continua = false` em toda campanha existente). O CHECK `campaigns_entrada_continua_contida` exige teto diário e janela de horário quando o modo é contínuo (rascunho excetuado por `status = 'draft'`, como o pointer não-`active` da 9016: sem isso, marcar o modo antes de digitar o teto daria 23514 no SALVAR e prenderia o operador num rascunho impossível de corrigir): na lista o volume é limitado pelo recorte que o operador conferiu, no contínuo não há recorte nem conferência, então o teto e a janela deixam de ser configuração e passam a ser a contenção — e contenção é constraint. Funil e etapa NÃO entram no CHECK de propósito (a FK os anula quando o funil ou a etapa é apagado, e um CHECK que os exigisse faria esse DELETE falhar com 23502/23514, que é exatamente o defeito que a 9032 consertou): quem os exige é o gate de `lib/campanhas/acoes.ts`, que recusa preparar, iniciar e agendar sem eles, e o gatilho, que nunca casa etapa nula.
--
-- 9038 — QUEM ENTRA NA CAMPANHA: O MODO CONTÍNUO POR ETAPA
--
-- ## ANTES DO DEPLOY
--
-- Nada aqui reinterpreta dado existente: as duas colunas nascem com default que
-- reproduz o comportamento de hoje (`entrada_continua = false`, etapa nula), e o
-- CHECK é vacuamente verdadeiro para toda linha em que a flag é falsa — o que é
-- TODA linha depois desta migration, porque nada liga a flag sozinho. A conta
-- abaixo é confirmação, não premissa, e o esperado é a segunda coluna igual à
-- primeira:
--
--   select count(*) as campanhas,
--          count(*) filter (where not entrada_continua) as em_modo_lista
--     from public.campaigns;
--
-- ## Por que a campanha precisava de um segundo modo de público
--
-- O modo lista responde "fale com estas 300 pessoas": o recorte vira
-- `campaign_recipients` na preparação, o operador CONFERE o número e o texto, e
-- depois disso a lista não muda mais. É o que torna a abordagem auditável, e é
-- por isso que ele continua sendo o padrão.
--
-- O que ele não responde é "fale com quem chegar aqui a partir de agora". O lead
-- novo entra na etapa um por vez, ao longo do mês; para alcançá-lo com lista
-- fixa o operador teria de preparar uma campanha por dia. A cadência (9016) já
-- tem essa porta — `trigger_config.kind='stage_change'` em
-- `lib/followup/gatilho-etapa.ts` — e é ela que esta migration empresta.
--
-- ## Por que o estado mora em `campaigns`, e não no `trigger_config` do pointer
--
-- A régua da campanha (9037) é um pointer de follow-up, e o pointer tem
-- `trigger_config`. Guardar o modo ali seria a escolha errada por dois motivos:
--
--   1. CAMPANHA CONTÍNUA NÃO PRECISA DE PASSOS. Sem passos não existe pointer —
--      `publicarReguaDaCampanha` devolve `pointerId: null` e até SOLTA o
--      `followup_pointer_id` da campanha. O modo moraria num objeto que o
--      operador apaga ao limpar a lista de passos, e a campanha continuaria
--      `running` sem abordar mais ninguém, sem erro em tela nenhuma.
--   2. O `trigger_config` DO POINTER DESCREVE COMO SE ENTRA NA RÉGUA, e na
--      régua se entra de um jeito só: quando a 1ª mensagem SAI
--      (`inscreverContatoNaRegua`). Escrever `stage_change` ali seria uma
--      afirmação falsa sobre a régua E armaria uma SEGUNDA porta para o mesmo
--      pointer — `carregaPointersDeEtapa` passaria a entregá-lo ao produtor
--      genérico. Duas portas para a mesma régua é o modo de falha que
--      `lib/followup/superficies.ts` existe para evitar.
--
-- Então `trigger_config` do pointer da campanha segue `{kind:'manual',
-- cancel_on_reply:true}`, como na 9037, e quem decide o público é a campanha.
--
-- ## Por que BOOLEAN e não um `audience_mode` com CHECK de conjunto
--
-- São dois modos. Um `text` com CHECK de conjunto criaria vocabulário fechado a
-- manter em três lugares (banco, TypeScript e o par de
-- `tests/invariants/vocabulario-banco-x-typescript.test.ts`), e um boolean não
-- deriva para valor desconhecido. Um terceiro modo, se existir, troca a coluna
-- numa migration de uma linha; um vocabulário errado hoje é vocabulário para
-- sempre.
--
-- ## Por que nenhuma tabela nova, e nenhum motor novo
--
-- O gatilho insere UMA linha em `campaign_recipients`, com `rendered_body` já
-- congelado pelo MESMO `renderizarVariacao` da preparação. Daí para frente o
-- `campaign-worker` não sabe (nem precisa saber) se aquela linha nasceu de um
-- snapshot ou de um card arrastado: ele revalida os vetos por pessoa, confere a
-- lista de exclusão, respeita o ritmo da campanha, escolhe o número no rodízio e
-- inscreve na régua. Um caminho de envio só, com os freios todos num lugar só.
--
-- E o anti-repetição vem de graça: `campaign_recipients_contato_unico unique
-- (campaign_id, contact_id)` já existe desde a 0375. Card que entra e sai da
-- etapa dez vezes bate no 23505 nas nove tentativas seguintes — uma abordagem,
-- não dez. `campaign_recipients_endereco_unico` faz o mesmo pelo telefone,
-- então dois cadastros gêmeos do mesmo número também rendem uma só.
--
-- ## Por que o teto e a janela viram CONSTRAINT no modo contínuo
--
-- No modo lista o volume do dia é limitado por algo que um humano olhou: o
-- recorte tem `limite` (teto de 5.000) e o operador leu o número antes de
-- apertar. Teto diário em branco ali é uma escolha sobre uma lista conhecida.
--
-- No modo contínuo não existe lista, não existe número para olhar e não existe o
-- momento "antes de apertar": a campanha fica de pé e aborda quem aparecer. O
-- teto diário é então a ÚNICA coisa que limita quantos estranhos recebem
-- mensagem por dia, e a janela é a única coisa que impede que recebam às três da
-- manhã. Isso não é preferência de configuração, é a contenção do recurso — e
-- contenção que o operador pode deixar em branco não é contenção.
--
-- O CHECK é a segunda tranca: o gate de `lib/campanhas/acoes.ts` e a rota de
-- edição recusam antes, com frase que o operador lê. O CHECK pega o INSERT/
-- UPDATE direto pela PostgREST com service_role, mesma doutrina do
-- `fn_passos_da_campanha_validos` da 9037.
--
-- ⚠️ RASCUNHO É EXCETUADO (`status = 'draft'`), do mesmo jeito que
-- `followup_flow_pointers_cadencia_completa` excetua o pointer que não está
-- `active`. Sem a exceção, o operador que marcasse o modo contínuo antes de
-- digitar o teto levaria 23514 no SALVAR e ficaria preso num rascunho que não dá
-- para corrigir sem apagar — é a armadilha que o comentário dos `passos` em
-- `lib/campanhas/schemas.ts` descreve. A contenção é cobrada na SAÍDA do
-- rascunho: `draft → preparing` é um UPDATE, e é nele que o CHECK morde.
--
-- ## Por que funil e etapa ficam FORA do CHECK
--
-- `campaigns_pipeline_org_fk` e a FK nova são `on delete set null (coluna)`,
-- pelo P2-3 do @Cassio_SecRev na 9032: apagar o funil ou a etapa zera SÓ a
-- referência e deixa a campanha na organização dela. Um CHECK que exigisse
-- `pipeline_id is not null` quando a flag está ligada faria esse DELETE falhar
-- com 23514 — reintroduzindo, por outro caminho, exatamente o defeito que a 9032
-- consertou (lá era 23502 por `organization_id`).
--
-- Então a exigência vive no aplicativo, e a falha é FECHADA: sem etapa, o
-- gatilho não casa nada (ele compara `entrada_etapa_id = to_stage_id`, e nulo
-- não casa), e a próxima ação de preparar/iniciar/agendar recusa com o motivo
-- na tela. Campanha contínua que perde a etapa para de abordar; nunca aborda
-- errado.
--
-- ## Idempotente
--
-- Colunas com `if not exists`, CHECK e FK com guarda em `pg_constraint` (nunca
-- drop+add, que deixaria a tabela sem a constraint se o processo morresse no
-- meio), índice com `if not exists`.

set local lock_timeout = '3s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O modo, e a etapa que o arma
-- ───────────────────────────────────────────────────────────────────────────

alter table public.campaigns
  add column if not exists entrada_continua boolean not null default false;

comment on column public.campaigns.entrada_continua is
  'false (default) = modo LISTA: o público é o snapshot congelado na preparação, como em toda '
  'campanha anterior à 9038. true = modo CONTÍNUO: quem entra na etapa de entrada_etapa_id é '
  'abordado por esta campanha, uma linha de campaign_recipients por chegada, pelo gatilho '
  'lib/campanhas/entrada-por-etapa.ts. O modo é escolha explícita do operador e SOBREVIVE ao '
  'DELETE da etapa (que só anula entrada_etapa_id): campanha contínua sem etapa para de '
  'abordar, em vez de virar campanha de lista vazia e ser concluída em silêncio. Migration 9038.';

alter table public.campaigns
  add column if not exists entrada_etapa_id uuid;

comment on column public.campaigns.entrada_etapa_id is
  'A etapa do funil que arma a entrada contínua (crm_stages). Lida só quando entrada_continua; '
  'NULL com o modo ligado = a etapa foi apagada, e o gatilho não casa nada (falha fechada). '
  'Não é a mesma coisa que stage_id, que é onde o CARD de quem foi abordado nasce (0378/9037): '
  'aqui é de onde a pessoa VEM. Migration 9038.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaigns_entrada_etapa_org_fk'
       and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_entrada_etapa_org_fk
      foreign key (organization_id, entrada_etapa_id)
      references public.crm_stages (organization_id, id)
      on delete set null (entrada_etapa_id);
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A contenção do modo contínuo
-- ───────────────────────────────────────────────────────────────────────────
-- Teto do dia e janela de horário: sem lista para conferir, são eles que limitam
-- quantos estranhos recebem mensagem e em que horário. Ver o racional acima.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaigns_entrada_continua_contida'
       and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_entrada_continua_contida
      check (
        not entrada_continua
        or status = 'draft'
        or (
          teto_diario is not null
          and janela_inicio_hora is not null
          and janela_fim_hora is not null
        )
      );
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O caminho quente do gatilho
-- ───────────────────────────────────────────────────────────────────────────
-- Toda mudança de etapa do CRM pergunta "alguma campanha contínua está armada
-- nesta etapa?". Sem índice, isso é varredura de `campaigns` a cada card
-- arrastado — e a esmagadora maioria dos arrastos não tem campanha nenhuma
-- armada. Parcial pela flag: o índice só carrega as poucas campanhas contínuas.

create index if not exists campaigns_entrada_por_etapa
  on public.campaigns (organization_id, entrada_etapa_id)
  where entrada_continua and entrada_etapa_id is not null;

notify pgrst, 'reload schema';
