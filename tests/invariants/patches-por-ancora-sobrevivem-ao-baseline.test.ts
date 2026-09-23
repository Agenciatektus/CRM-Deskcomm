// ─── Os patches por ÂNCORA sobreviveram à aplicação do baseline? ────────────
//
// POR QUE ESTE ARQUIVO EXISTE
//
// A migration 9010 não reescreve `fn_mesclar_contatos` nem
// `fn_lgpd_cascade_redact_contact`: ela LÊ a definição vigente do catálogo e
// troca um trecho por outro. Copiar as funções inteiras congelaria uma cópia
// que envelhece na primeira vez que o upstream mexer nelas — e foi exatamente
// assim que a cascata de LGPD perdeu, em silêncio, dois passos que já estavam
// consertados.
//
// O preço da âncora é este: o patch só vale se rodar DEPOIS da última definição
// da função. E o `baseline.sql` tem 37 mil linhas, com essas duas funções
// redefinidas quatro e dez vezes. A única coisa entre "funciona" e "revertido
// sem ninguém ver" é a ORDEM no arquivo.
//
// Hoje a ordem está certa: os apêndices do fim rodam depois. No dia em que
// alguém acrescentar um apêndice novo que redefina uma dessas funções, ele
// entra DEPOIS dos nossos, o patch é desfeito, e o guard de idempotência não
// ajuda — na execução seguinte o patch roda ANTES e não encontra o que mudar.
//
// O modo de falha é o pior que existe: o `install.sh` termina verde, o schema
// parece completo, e o que quebra é a anonimização de um titular que pediu para
// ser esquecido — meses depois, numa auditoria.
//
// Este teste roda DEPOIS do baseline aplicado, contra o catálogo, e é a única
// medida contínua de que os três patches estão de pé.

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * `pronargs` desambigua SOBRECARGA. Sem ele, com duas assinaturas o `-tA`
 * concatena as duas definicoes e um `toContain` passa se QUALQUER uma tiver a
 * string — teste verde com metade do produto quebrado.
 */
function definicao(nome: string, args: number): string {
  return sql(
    `select pg_get_functiondef(p.oid)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = '${nome}' and p.pronargs = ${args}`,
  );
}

describe("os patches por âncora sobrevivem ao baseline", () => {
  it("a fusão de contatos HERDA a identidade de Instagram", () => {
    // Sem isto: funde-se o contato do Instagram com o do WhatsApp, o IGSID fica
    // na lápide, e a próxima DM daquela pessoa não acha ninguém e CRIA UM
    // CONTATO NOVO — refazendo a duplicata que o operador acabou de desfazer.
    const def = definicao("fn_mesclar_contatos", 3);
    expect(def, "a função de fusão sumiu do catálogo").toContain("fn_mesclar_contatos");
    expect(def, "a herança do IGSID foi revertida pela reaplicação do baseline").toContain(
      "instagram_igsid = coalesce",
    );
    expect(def, "a guarda de unicidade contra terceiro vivo sumiu junto").toContain(
      "o.instagram_igsid = v_igsid",
    );
  });

  it("a fusão ABRE e FECHA a escotilha da trava de identidade", () => {
    // Abrir sem fechar deixa a trava desarmada pelo resto da transação — medido
    // no ensaio da PR #6, e é o defeito que o próprio conserto introduziu.
    const def = definicao("fn_mesclar_contatos", 3);
    const aberturas = (def.match(/deskcomm\.identidade_de_instagram'*,\s*'*on/g) ?? []).length;
    const fechamentos = (def.match(/deskcomm\.identidade_de_instagram'*,\s*'*off/g) ?? []).length;
    expect(aberturas, "a escotilha não é aberta — a fusão vai abortar com 42501").toBeGreaterThan(0);
    expect(fechamentos, "a escotilha é aberta e NÃO fechada — a trava fica desarmada").toBe(
      aberturas,
    );
  });

  it("a cascata de LGPD APAGA a identidade de Instagram", () => {
    // Sem isto: o titular exerce o direito de eliminação, a rota devolve
    // SUCESSO, os contadores fecham — e a linha segue carregando o `@` da
    // pessoa, que é identificador direto, e o id estável que a Meta emite para
    // ela. Falha silenciosa com recibo de conformidade por cima.
    const def = definicao("fn_lgpd_cascade_redact_contact", 3);
    expect(def, "a cascata de LGPD sumiu do catálogo").toContain(
      "fn_lgpd_cascade_redact_contact",
    );
    expect(def, "o apagamento da identidade de Instagram foi revertido").toContain(
      "instagram_igsid = null",
    );
    // A mesma função já perdeu o `transcript` duas vezes por este mecanismo
    // (ver 9008). Se ela perder de novo, que seja aqui e não numa auditoria.
    expect(def, "a cascata perdeu o transcript de novo — foi assim da última vez").toContain(
      "transcript = null",
    );
  });

  it("a trava de identidade existe e é BEFORE UPDATE OF na coluna certa", () => {
    // `update of` + `when` tiram a trigger do caminho quente: sem eles ela seria
    // considerada em todo update de `contacts`, inclusive no bump de
    // `last_activity_at` a cada mensagem recebida.
    const t = sql(`
      select tgname || '|' || pg_get_triggerdef(t.oid)
        from pg_trigger t
       where tgname = 'trg_identidade_de_instagram_e_do_sistema'
    `);
    expect(t, "a trava de identidade não existe").toContain(
      "trg_identidade_de_instagram_e_do_sistema",
    );
    expect(t, "a trigger perdeu o `update of` e voltou ao caminho quente").toMatch(
      /UPDATE OF instagram_igsid/i,
    );
    // `/WHEN/` sozinho aceitaria `WHEN (true)`, que nao filtra nada.
    expect(t, "a cláusula WHEN não filtra mais a coluna certa").toMatch(
      /WHEN .*instagram_igsid/i,
    );
  });

  it("a trava de identidade NÃO é security definer", () => {
    // Foi decisão consciente da PR #6: o padrão-irmão
    // (`fn_colunas_de_cliente_sao_do_sistema`) também não é, o corpo só lê
    // NEW/OLD, e privilégio que não compra nada só amplia o que uma edição
    // futura poderia fazer. Nada protegia essa decisão até aqui.
    const prosecdef = sql(`
      select p.prosecdef
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fn_identidade_de_instagram_e_do_sistema'
    `).trim();
    expect(prosecdef, "a trigger virou security definer — privilégio que ela não precisa").toBe(
      "f",
    );
  });
});
