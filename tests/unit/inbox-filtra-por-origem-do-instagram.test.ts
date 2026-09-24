// ─── O filtro de origem, da URL até a query ────────────────────────────────
//
// Um filtro de Inbox atravessa quatro lugares, e falhar em qualquer um deles
// produz um defeito diferente — todos silenciosos:
//
//   schema não aceita  → 422 no meio da digitação do operador
//   rota não lê        → a lista volta INTEIRA, sem erro, como se não houvesse
//                        filtro (foi o que aconteceu com `tag`, e está escrito
//                        no comentário da rota até hoje)
//   query não aplica   → idem
//   contagem não aplica→ o badge da aba fica MAIOR que a lista, e o operador
//                        conclui que a lista está escondendo conversa
//
// O último é o mais traiçoeiro porque a tela não parece quebrada: parece que
// sumiu conversa.

import { describe, expect, it } from "vitest";

import { listConversationsQuerySchema } from "@/lib/schemas/messaging";
import {
  filtrosAuxiliaresDaContagem,
} from "@/app/api/v1/conversations/counts/route";

describe("o schema aceita a origem, e só os valores que existem", () => {
  it("aceita `direct` e `comentario`", () => {
    for (const entrada of ["direct", "comentario"]) {
      const r = listConversationsQuerySchema.safeParse({ entrada });
      expect(r.success, entrada).toBe(true);
    }
  });

  it("RECUSA `story`, que não é valor de conversa", () => {
    // Resposta a story É um Direct e cai na mesma conversa de DM. Aceitar
    // `story` aqui devolveria uma lista sempre vazia — e lista vazia parece
    // resposta, não erro.
    expect(listConversationsQuerySchema.safeParse({ entrada: "story" }).success).toBe(false);
  });

  it("RECUSA valor inventado em vez de ignorar", () => {
    expect(listConversationsQuerySchema.safeParse({ entrada: "qualquer" }).success).toBe(false);
  });

  it("sem o parâmetro, segue sem filtro", () => {
    const r = listConversationsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.entrada).toBeUndefined();
  });
});

describe("a contagem das abas aplica o MESMO filtro da lista", () => {
  it("filtra por origem quando o parâmetro vem", () => {
    const filtros = filtrosAuxiliaresDaContagem(new URLSearchParams("entrada=comentario"));
    expect(filtros).toContainEqual(["instagram_entrada", "comentario"]);
  });

  it("não inventa filtro quando o valor é lixo", () => {
    // Um valor desconhecido viraria `.eq("instagram_entrada", "lixo")` e toda
    // aba mostraria zero — o oposto do defeito de badge inflado, e igualmente
    // mudo.
    const filtros = filtrosAuxiliaresDaContagem(new URLSearchParams("entrada=lixo"));
    expect(filtros.some(([coluna]) => coluna === "instagram_entrada")).toBe(false);
  });

  it("sem o parâmetro, não acrescenta nada", () => {
    const filtros = filtrosAuxiliaresDaContagem(new URLSearchParams(""));
    expect(filtros.some(([coluna]) => coluna === "instagram_entrada")).toBe(false);
  });

  it("convive com o filtro de canal, sem derrubá-lo", () => {
    const filtros = filtrosAuxiliaresDaContagem(
      new URLSearchParams("channel_session_id=abc&entrada=direct"),
    );
    expect(filtros).toContainEqual(["channel_session_id", "abc"]);
    expect(filtros).toContainEqual(["instagram_entrada", "direct"]);
  });
});
