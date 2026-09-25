/**
 * O funil não gravava de que fontes ele vive — e não dizia isso a ninguém.
 *
 * ─── O DEFEITO, MEDIDO EM `master@cb123099` ────────────────────────────────
 *
 * `bodySchema` ACEITAVA `fontes` (linha 79), com um comentário explicando que
 * precisava estar declarado porque o schema é `.strict()`. Mas o tipo
 * `PatchDoFunil` não tinha o campo, e nenhuma linha atribuía
 * `patchDoAlvo.fontes`. Resultado: a requisição passava na validação, a rota
 * respondia 200, e o campo simplesmente não viajava no UPDATE.
 *
 * O que o operador via: clicar em "Direct do Instagram" e a caixa não marcar.
 * Sem erro, sem toast, sem nada — a tela recarregava do servidor, recebia o
 * valor antigo e desenhava de novo o estado anterior.
 *
 * ─── POR QUE ISTO É PIOR QUE NÃO ACEITAR O CAMPO ───────────────────────────
 *
 * `.strict()` existe para que campo desconhecido falhe ALTO, com 422. Declarar
 * o campo desliga essa proteção — e, sem persistir, não entrega nada no lugar
 * dela. A validação passa a atestar uma escrita que não acontece.
 *
 * E a consequência não é cosmética: `crm_pipelines.fontes` governa a PORTA de
 * entrada. Fonte que não está em nenhum funil não entra — nem conversa, nem
 * mensagem, nem lead. Um funil que não consegue ligar o Instagram é um canal
 * conectado que nunca recebe nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { PATCH } from "@/app/api/v1/pipelines/[id]/route";
import { ORG_ID, OUTRA_ORG, PIPE, authOk, funilRow, makeDb } from "@/tests/helpers/stages-db-double";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

function patch(id: string, body: Record<string, unknown>): Promise<Response> {
  return PATCH(
    new NextRequest(`http://localhost/api/v1/pipelines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

function dbComOFunil() {
  const db = makeDb({ pipelines: [funilRow({ id: PIPE, name: "Vendas", is_default: true })] });
  vi.mocked(createClient).mockResolvedValue(db.client as never);
  return db;
}

/** O que a rota mandou para `crm_pipelines` — ou `undefined` se não mandou nada. */
function escritaNoFunil(db: ReturnType<typeof makeDb>) {
  const e = db.escritas.find((x) => x.table === "crm_pipelines" && x.tipo === "update");
  return e?.patch as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
  vi.mocked(createClient).mockReset();
  authOk();
});

describe("ligar uma fonte no funil chega ao banco", () => {
  it("o UPDATE carrega `fontes` — não basta a rota responder 200", async () => {
    const db = dbComOFunil();

    const r = await patch(PIPE, { fontes: ["whatsapp", "instagram_direct"] });
    expect(r.status).toBe(200);

    // A asserção que faltava. Antes, o 200 acima passava e este `expect` era o
    // único que separava "gravou" de "respondeu sucesso e não fez nada".
    const escrita = escritaNoFunil(db);
    expect(escrita, "a rota respondeu 200 sem mandar nada ao banco").toBeDefined();
    expect(escrita!.fontes).toEqual(["whatsapp", "instagram_direct"]);
  });

  it("a escrita é escopada à organização — não basta casar o id", async () => {
    const db = dbComOFunil();
    await patch(PIPE, { fontes: ["whatsapp", "instagram_comentario"] });

    const e = db.escritas.find((x) => x.table === "crm_pipelines" && x.tipo === "update");
    expect(e!.filtros).toContainEqual(["organization_id", ORG_ID]);
    expect(e!.filtros).toContainEqual(["id", PIPE]);
  });

  it("desligar uma fonte também grava", async () => {
    // O caminho de volta importa tanto quanto o de ida: um funil que liga o
    // Instagram e não consegue desligar prende o cliente num estado que ele
    // escolheu por engano.
    const db = dbComOFunil();
    await patch(PIPE, { fontes: ["whatsapp"] });
    expect(escritaNoFunil(db)!.fontes).toEqual(["whatsapp"]);
  });

  it("fonte repetida chega uma vez só", async () => {
    // O CHECK do banco garante o vocabulário e `cardinality > 0`, não unicidade.
    // Duplicata voltaria para a tela como a mesma caixa contada duas vezes.
    const db = dbComOFunil();
    await patch(PIPE, { fontes: ["whatsapp", "instagram_direct", "whatsapp"] });
    expect(escritaNoFunil(db)!.fontes).toEqual(["whatsapp", "instagram_direct"]);
  });

  it("`fontes` convive com outro campo no MESMO update", async () => {
    // Nome e fontes viajam no patch do alvo; se um sobrescrevesse o outro, o
    // operador perderia uma das duas mudanças sem aviso.
    const db = dbComOFunil();
    await patch(PIPE, { name: "Vendas IG", fontes: ["whatsapp", "instagram_direct"] });

    const escrita = escritaNoFunil(db)!;
    expect(escrita.name).toBe("Vendas IG");
    expect(escrita.fontes).toEqual(["whatsapp", "instagram_direct"]);
  });
});

describe("o que a porta NÃO aceita", () => {
  it("fonte inventada é recusada com 422, não ignorada em silêncio", async () => {
    // Ignorar gravaria o resto do pedido e devolveria 200, e quem chamou
    // concluiria que a fonte nova existe.
    const db = dbComOFunil();
    const r = await patch(PIPE, { fontes: ["whatsapp", "telegram"] });

    expect(r.status).toBe(422);
    expect(escritaNoFunil(db), "nada pode ser gravado num pedido recusado").toBeUndefined();
  });

  it("lista vazia é recusada — funil sem fonte é atendimento parado em silêncio", async () => {
    const db = dbComOFunil();
    const r = await patch(PIPE, { fontes: [] });

    expect(r.status).toBe(422);
    expect(escritaNoFunil(db)).toBeUndefined();
  });

  it("pedido sem `fontes` não mexe na coluna", async () => {
    // Enviar `fontes` num PATCH que só renomeia apagaria a configuração de quem
    // nem sabia que ela existe.
    const db = dbComOFunil();
    await patch(PIPE, { name: "Só o nome" });

    const escrita = escritaNoFunil(db)!;
    expect(escrita.name).toBe("Só o nome");
    expect("fontes" in escrita, "a coluna não pode ser tocada sem pedido").toBe(false);
  });
});

describe("as cercas que a auditoria pediu", () => {
  it("`fontes` sobrevive ao MERGE com a troca de padrão", async () => {
    // Eleger padrao pode exigir DOIS updates, e o patch do alvo e mesclado com o
    // da troca: `{ ...updates[i].patch, ...patchDoAlvo }`. Nenhum outro teste
    // exercita esse merge, entao qualquer um dos dois lados podia sumir dali com
    // a suite inteira verde.
    //
    // O QUE ESTE TESTE PEGA, medido por controle negativo: descartar QUALQUER um
    // dos dois lados do merge reprova aqui.
    //
    // O QUE ELE NAO PEGA, e vale estar escrito: INVERTER a ordem do spread passa
    // verde. Nao e buraco do teste — hoje os dois conjuntos de chaves sao
    // disjuntos (`is_default`/`is_client_pipeline` de um lado; `name`,
    // `description`, `fontes`, `position` do outro), entao a ordem nao decide
    // nada. Se um dia a mesma chave puder vir dos dois lados, e ESTE comentario
    // que avisa que a ordem passa a importar e o teste precisa crescer.
    const db = makeDb({
      pipelines: [
        funilRow({ id: PIPE, name: "Vendas" }),
        funilRow({ id: "66666666-6666-4666-8666-666666666666", name: "Antigo", is_default: true }),
      ],
    });
    vi.mocked(createClient).mockResolvedValue(db.client as never);

    const r = await patch(PIPE, { is_default: true, fontes: ["whatsapp", "instagram_direct"] });
    expect(r.status).toBe(200);

    const noAlvo = db.escritas.find(
      (e) => e.table === "crm_pipelines" && e.filtros.some(([c, v]) => c === "id" && v === PIPE),
    );
    const corpo = noAlvo!.patch as Record<string, unknown>;
    expect(corpo.is_default, "a troca de padrão precisa continuar valendo").toBe(true);
    expect(corpo.fontes, "as fontes não podem se perder no merge").toEqual([
      "whatsapp",
      "instagram_direct",
    ]);
  });

  it("funil de OUTRA organização é 404, e nada é escrito", async () => {
    // A escrita ja e filtrada por `organization_id`, mas a recusa acontece antes:
    // a leitura e escopada, o funil alheio nao esta na lista, e a rota devolve o
    // MESMO 404 de funil inexistente — sem confirmar que ele existe em algum
    // lugar. Esta e a camada que faltava em teste.
    const db = makeDb({
      pipelineOrg: OUTRA_ORG,
      pipelines: [funilRow({ id: PIPE, name: "Da outra org", organization_id: OUTRA_ORG })],
    });
    vi.mocked(createClient).mockResolvedValue(db.client as never);

    const r = await patch(PIPE, { fontes: ["whatsapp", "instagram_direct"] });
    expect(r.status).toBe(404);
    expect(escritaNoFunil(db), "nem uma escrita pode sair de um 404").toBeUndefined();
  });

  it("array gigante é recusado no boundary, não deduplicado depois", async () => {
    // Sao tres fontes no vocabulario; um array maior so pode ser repeticao. Sem
    // `.max(3)` o zod valida elemento a elemento e o `Set` reduz a 1 no fim —
    // trabalho proporcional ao que o cliente mandar, por uma escrita de 1 item.
    const db = dbComOFunil();
    const r = await patch(PIPE, { fontes: Array(5000).fill("whatsapp") });

    expect(r.status).toBe(422);
    expect(escritaNoFunil(db)).toBeUndefined();
  });
});
