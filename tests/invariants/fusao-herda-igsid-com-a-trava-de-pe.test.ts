// ─── A fusão de contatos sobrevive à trava de identidade de Instagram ───────
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Na PR #6 eu criei DOIS consertos de segurança que, juntos, quebravam a fusão
// de contatos — e nenhum dos dois tinha o defeito sozinho:
//
//   a migration 9010 fez `fn_mesclar_contatos` HERDAR o `instagram_igsid` do
//   perdedor (sem isso, fundir Instagram com WhatsApp deixava o IGSID na
//   lápide e a próxima DM criava um contato novo, refazendo a duplicata);
//
//   a mesma 9010 criou uma trigger que RECUSA escrita de `instagram_igsid` por
//   sessão de gente (sem isso, um `viewer` gravava o IGSID de outra pessoa num
//   contato que ele controla e sequestrava o roteamento do atendimento).
//
// `SECURITY DEFINER` troca o PAPEL e NÃO troca `auth.uid()`. A rota de merge usa
// o cliente do USUÁRIO de propósito. Resultado: a herança mudava a coluna, a
// trava levantava 42501, e a fusão inteira abortava — exatamente e somente
// quando a herança teria efeito.
//
// O conserto foi uma escotilha de transação (`deskcomm.identidade_de_instagram`),
// fechada logo depois do uso porque `set_config(..., true)` vale pelo resto da
// transação e deixava a trava desarmada.
//
// ⚠️ ESTE TESTE CASA PELA MENSAGEM, NUNCA PELO SQLSTATE.
//
// `42501` é compartilhado por DOIS caminhos: o gate de papel da própria
// `fn_mesclar_contatos` (`insufficient_role`) e esta trigger. Na investigação
// do defeito, o primeiro 42501 que recebi veio do gate de papel porque meu
// usuário de teste não era manager — e eu quase registrei como confirmação.
// Um teste que casasse o código passaria pelo motivo errado, que é pior que
// teste nenhum: compra silêncio.

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG = "cccccccc-0000-4000-8000-0000000000a1";
const USER = "cccccccc-0000-4000-8000-0000000000d1";
const VENC = "cccccccc-0000-4000-8000-0000000000e1";
const PERD = "cccccccc-0000-4000-8000-0000000000f1";

function limpar() {
  sql(`
    delete from contacts where organization_id = '${ORG}';
    delete from user_organizations where organization_id = '${ORG}';
    delete from organizations where id = '${ORG}';
    delete from auth.users where id = '${USER}';
  `);
}

describe("fusão de contatos com a trava de identidade de Instagram", () => {
  it("o manager funde pela TELA e o vencedor HERDA o IGSID", () => {
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
        values ('${PERD}', '${ORG}', 'perdedor com igsid', 'igsid-da-regressao', 'perdedor');
    `);

    // SESSÃO DE GENTE — é isto que a rota /contacts/merge faz. Como `postgres`
    // a trigger passa livre (`auth.uid()` é null) e o teste passaria sem provar
    // nada: é a mesma armadilha do 42501.
    const saida = sql(`
      begin;
      select set_config('request.jwt.claims',
        json_build_object('sub','${USER}','role','authenticated')::text, true);
      set local role authenticated;
      select public.fn_mesclar_contatos('${ORG}', '${VENC}', array['${PERD}']::uuid[]) is not null;
      reset role;
      select coalesce((select instagram_igsid from contacts where id = '${VENC}'), '(NAO HERDOU)');
      commit;
    `);

    expect(saida, "a fusão precisa concluir e o vencedor herdar o IGSID do perdedor").toContain(
      "igsid-da-regressao",
    );
  });

  it("e a trava continua RECUSANDO a tela — inclusive depois da fusão", () => {
    // A escotilha é de TRANSAÇÃO. Se ela não fechar depois do uso, fica
    // desarmada pelo resto do request e qualquer escrita posterior passa.
    // Medido: sem o reset, um `update` logo após a fusão era ACEITO.
    const saida = sql(`
      begin;
      select set_config('request.jwt.claims',
        json_build_object('sub','${USER}','role','authenticated')::text, true);
      set local role authenticated;
      do $regressao$
      begin
        update public.contacts set instagram_igsid = 'roubado' where id = '${VENC}';
        raise notice 'RESULTADO=A TELA ESCREVEU';
      exception when insufficient_privilege then
        raise notice 'RESULTADO=%', sqlerrm;
      end
      $regressao$;
      rollback;
    `);

    // Casa pela MENSAGEM. O SQLSTATE 42501 também sai do gate de papel da
    // fusão, e casá-lo deixaria o teste verde pelo motivo errado.
    expect(saida, "a trava precisa recusar a escrita pela tela").toContain(
      "escrita pelo sistema",
    );
    expect(saida, "a tela não pode conseguir escrever a identidade").not.toContain(
      "A TELA ESCREVEU",
    );

    limpar();
  });
});
