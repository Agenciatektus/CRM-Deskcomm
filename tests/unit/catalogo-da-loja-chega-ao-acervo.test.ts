import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/**
 * TRÊS DESENCONTROS EM SÉRIE, E CADA UM ZERAVA O RESULTADO SOZINHO.
 *
 * Medido na Fiorotto em 21/10/2026: integração `healthy`, 8 webhooks assinados,
 * 879 produtos na loja, ZERO no acervo do agente. O modo de falha é mudo —
 * conexão saudável, auditoria limpa, nenhum erro em lugar nenhum.
 *
 * 1. o webhook de produto emitia um nome que ninguém escutava;
 * 2. o indexador procurava a loja por um status que o CHECK da tabela nem
 *    aceita, então nunca achava credencial;
 * 3. a carga inicial não existia: sem `product_id` a função devolvia `[]`.
 *
 * São cercas de FORMA (leem o fonte), e não de comportamento: o caminho real
 * atravessa webhook assinado, fila, worker e API externa. Uma cerca que lê o
 * código não prova que o catálogo chega, mas prova que nenhum dos três voltou —
 * e os três voltam calados, que é o que os torna perigosos.
 */
describe("o catálogo da loja chega ao acervo", () => {
  it("⭐ o webhook de produto emite o evento que o indexador escuta", () => {
    const webhook = ler("app/api/v1/webhooks/nuvemshop/[event]/route.ts");
    const handler = ler("workers/rag-indexer.handler.ts");

    expect(webhook).toContain('"nuvemshop.product_synced"');
    // E o ouvinte continua escutando esse mesmo nome.
    expect(handler).toContain("nuvemshop.product_synced");
  });

  it("⭐ o payload de produto leva `product_id`, que é o campo que o worker lê", () => {
    const webhook = ler("app/api/v1/webhooks/nuvemshop/[event]/route.ts");
    const worker = ler("workers/rag-indexer.ts");

    expect(webhook).toContain("product_id: String(");
    expect(worker).toContain('row.payload["product_id"]');
  });

  it("⭐ o indexador procura a loja por um status que a tabela aceita", () => {
    const worker = ler("workers/rag-indexer.ts");
    expect(worker).toContain('.eq("status", "healthy")');
    // `active` nunca esteve no CHECK de tenant_integrations: connecting,
    // healthy, token_expired, scope_missing, disconnected, rate_limited, error.
    expect(worker).not.toContain('.eq("status", "active")');
  });

  it("⭐ a conexão dispara a carga inicial, e o worker sabe recebê-la", () => {
    const callback = ler("app/api/v1/integrations/nuvemshop/callback/route.ts");
    const worker = ler("workers/rag-indexer.ts");

    expect(callback).toContain("catalogo_inteiro: true");
    expect(worker).toContain('row.payload["catalogo_inteiro"]');
    // E sem produto específico ela lista a loja, em vez de devolver vazio.
    expect(worker).toContain("listarCatalogoDaLoja");
  });

  it("CONTROLE — a listagem é paginada e tem teto", () => {
    // Sem teto, um catálogo grande vira laço no worker; sem paginação, só as
    // primeiras 200 peças entram e o resto some sem aviso.
    const worker = ler("workers/rag-indexer.ts");
    expect(worker).toMatch(/per_page=200&page=\$\{pagina\}/);
    expect(worker).toMatch(/pagina <= 50/);
  });

  it("CONTROLE — evento sem produto e sem a marca de carga continua recusado", () => {
    // A porta nova não pode virar porta escancarada: evento vazio ainda é
    // evento vazio, e precisa continuar saindo com motivo.
    const worker = ler("workers/rag-indexer.ts");
    expect(worker).toContain('return { fonte: null, motivo: "evento_sem_product_id" }');
  });
});
