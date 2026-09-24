// ─── A fusão de contatos sobrevive à trava de identidade de Instagram ───────
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Na PR #6 nasceram DOIS consertos de segurança que, juntos, quebravam a fusão
// de contatos — e nenhum dos dois tinha o defeito sozinho:
//
//   a migration 9010 fez `fn_mesclar_contatos` HERDAR o `instagram_igsid` do
//   perdedor (sem isso, fundir Instagram com WhatsApp deixava o IGSID na
//   lápide e a próxima DM criava um contato novo, refazendo a duplicata que o
//   operador acabou de desfazer);
//
//   a mesma 9010 criou uma trigger que RECUSA escrita de `instagram_igsid` por
//   sessão de gente (sem isso, um `viewer` grava o IGSID de outra pessoa num
//   contato que ele controla e sequestra o roteamento do atendimento).
//
// `SECURITY DEFINER` troca o PAPEL e NÃO troca `auth.uid()`, e a rota de merge
// usa o cliente do USUÁRIO de propósito. Resultado: a herança mudava a coluna,
// a trava levantava 42501, e a fusão inteira abortava — exatamente e somente
// quando a herança teria efeito.
//
// O conserto foi uma escotilha de transação (`deskcomm.identidade_de_instagram`),
// ABERTA antes do update do vencedor e FECHADA logo depois. O fechamento não é
// zelo: `set_config(..., true)` vale pelo resto da TRANSAÇÃO, e sem ele a trava
// fica desarmada para qualquer escrita seguinte no mesmo request.
//
// ─── Três armadilhas que este arquivo evita, e as três já me pegaram ────────
//
// 1. CASAR PELO SQLSTATE. `42501` é compartilhado por dois caminhos: o gate de
//    papel da própria `fn_mesclar_contatos` (`insufficient_role`) e esta
//    trigger. Na investigação do defeito, o primeiro 42501 que recebi veio do
//    gate, porque meu usuário de teste não era manager — e quase registrei como
//    confirmação. Aqui se casa a MENSAGEM.
//
// 2. LER A MENSAGEM DE stderr. `raise notice` sai em stderr, e o `sql()` de
//    `gov-helpers` devolve só stdout — está escrito na docstring dele. A
//    asserção nunca casaria, e a asserção negativa passaria VACUAMENTE sobre
//    string vazia. Esta casa já documentou isso em
//    `catalogo-so-gestor-muda-preco.test.ts`. Por isso o desfecho vem numa
//    tabela temporária, lida por `select`.
//
// 3. TESTAR A TRAVA FORA DA TRANSAÇÃO DA FUSÃO. Numa transação separada a
//    escotilha nunca chega a ser aberta — e aí dá para REMOVER o
//    `set_config(..., 'off', ...)` da migration que o teste continua verde.
//    O segundo caso abaixo roda a fusão e a tentativa de escrita na MESMA
//    transação, que é a única forma de exercer o vazamento.

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG = "cccccccc-0000-4000-8000-0000000000a1";
const USER = "cccccccc-0000-4000-8000-0000000000d1";
const VENC = "cccccccc-0000-4000-8000-0000000000e1";
const PERD = "cccccccc-0000-4000-8000-0000000000f1";
const IGSID = "igsid-da-regressao";

function limpar() {
  sql(`
    delete from contacts where organization_id = '${ORG}';
    delete from user_organizations where organization_id = '${ORG}';
    delete from organizations where id = '${ORG}';
    delete from auth.users where id = '${USER}';
  `);
}

function montar() {
  limpar();
  sql(`
    insert into auth.users (id, email) values ('${USER}', 'manager-fusao@deskcomm.test');
    insert into organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'fusao-igsid', 'Fusao LTDA', 'Fusao');
    insert into user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER}', '${ORG}', 'manager', now());
    insert into contacts (id, organization_id, name)
      values ('${VENC}', '${ORG}', 'vencedor sem igsid');
    insert into contacts (id, organization_id, name, instagram_igsid, instagram_username)
      values ('${PERD}', '${ORG}', 'perdedor com igsid', '${IGSID}', 'perdedor');
  `);
}

describe("fusão de contatos com a trava de identidade de Instagram", () => {
  it("o manager funde pela TELA e o vencedor HERDA o IGSID", () => {
    montar();

    // SESSÃO DE GENTE — é o que a rota /contacts/merge faz. Como `postgres` a
    // trigger passa livre (`auth.uid()` é null) e o teste ficaria verde sem
    // provar nada.
    const saida = sql(`
      begin;
      select set_config('request.jwt.claims',
        json_build_object('sub','${USER}','role','authenticated')::text, true);
      set local role authenticated;
      select public.fn_mesclar_contatos('${ORG}', '${VENC}', array['${PERD}']::uuid[]) is not null;
      reset role;
      select coalesce((select instagram_igsid from contacts where id = '${VENC}'), 'NAO-HERDOU');
      commit;
    `);

    expect(saida, "a fusão tem de concluir e o vencedor herdar o IGSID do perdedor").toContain(
      IGSID,
    );
    expect(saida, "o vencedor ficou sem herdar").not.toContain("NAO-HERDOU");
    limpar();
  });

  it("e a trava recusa a tela NA MESMA TRANSAÇÃO, depois da fusão", () => {
    // Este caso é o que prova o FECHAMENTO da escotilha — ver a armadilha 3.
    montar();

    const saida = sql(`
      begin;
      select set_config('request.jwt.claims',
        json_build_object('sub','${USER}','role','authenticated')::text, true);
      create temp table desfecho(t text) on commit drop;
      -- GRANT explicito: a tabela nasce do postgres e o insert acontece como
      -- authenticated. Sem isto o bloco falha com 'permission denied for table
      -- desfecho' ANTES de chegar na trava, e o teste fica vermelho pelo motivo
      -- errado, escondendo se a trava funciona ou nao.
      grant insert on desfecho to authenticated;
      set local role authenticated;
      select public.fn_mesclar_contatos('${ORG}', '${VENC}', array['${PERD}']::uuid[]) is not null;
      do $regressao$
      begin
        update public.contacts set instagram_igsid = 'roubado' where id = '${VENC}';
        insert into desfecho values ('A-TELA-ESCREVEU');
      exception when insufficient_privilege then
        -- Tabela e nao 'raise notice': o helper le so stdout, notice sai em
        -- stderr, e a assercao nunca casaria. Ver a armadilha 2 no topo.
        -- (sem crase aqui: este SQL vive dentro de um template literal do JS,
        --  e uma crase fecharia a string)
        insert into desfecho values (sqlerrm);
      end
      $regressao$;
      reset role;
      select t from desfecho;
      select coalesce((select instagram_igsid from contacts where id = '${VENC}'), 'NULO');
      commit;
    `);

    // MENSAGEM, não SQLSTATE — ver a armadilha 1.
    expect(saida, "a trava precisa recusar a escrita pela tela").toContain(
      "escrita pelo sistema",
    );
    expect(saida, "a tela não pode conseguir escrever a identidade").not.toContain(
      "A-TELA-ESCREVEU",
    );
    // E o ESTADO, não só a mensagem: a coluna continua com o valor herdado.
    expect(saida, "o valor herdado tem de continuar intacto").toContain(IGSID);
    expect(saida, "a escrita da tela não pode ter passado").not.toContain("roubado");

    limpar();
  });
});
