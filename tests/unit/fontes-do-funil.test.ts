// ─── A fonte decide a ENTRADA, não a exibição ───────────────────────────────
//
// Decisão do Peterson: fonte que não está ativada em nenhum funil não gera lead
// NEM conversa — "comentário não cai no Inbox a não ser que tenha pipeline
// configurado pra receber ele".
//
// Os dois casos que este arquivo existe para travar são silenciosos quando
// quebram, e um deles derruba atendimento:
//
//   1. erro de consulta virando "não aceita" descartaria mensagem de cliente
//      por causa de um hiccup do banco — e o descarte é DEFINITIVO, porque
//      nada chega a ser gravado;
//   2. `story` ganhando fonte própria obrigaria o cliente a marcar duas caixas
//      para receber o que ele pensa como uma coisa só (Direct).

import { describe, expect, it } from "vitest";
import {
  ehFonteConhecida,
  fonteDaEntrada,
  funilQueAceita,
} from "@/lib/leads/fontes-do-funil";

function dbFake(resposta: { data?: unknown; error?: { message: string } }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "contains", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => resposta;
  return { from: () => q } as never;
}

describe("de qual fonte é a conversa", () => {
  it("WhatsApp é WhatsApp", () => {
    expect(fonteDaEntrada("whatsapp")).toBe("whatsapp");
  });

  it("Direct e story são a MESMA fonte — o cliente pensa nos dois como DM", () => {
    expect(fonteDaEntrada("instagram", "direct")).toBe("instagram_direct");
    expect(fonteDaEntrada("instagram", "story")).toBe("instagram_direct");
  });

  it("comentário é fonte SEPARADA — é o que permite um funil só de comentários", () => {
    expect(fonteDaEntrada("instagram", "comentario")).toBe("instagram_comentario");
  });

  it("canal desconhecido não tem fonte, e quem chama trata isso", () => {
    expect(fonteDaEntrada("telegram")).toBeNull();
    expect(fonteDaEntrada("instagram", null)).toBeNull();
  });

  it("o vocabulário é fechado, igual ao CHECK da migration 9012", () => {
    expect(ehFonteConhecida("whatsapp")).toBe(true);
    expect(ehFonteConhecida("instagram_comentario")).toBe(true);
    // `whats`, `WhatsApp` e afins não existem: string livre viraria três
    // grafias em três instalações e o filtro não acharia nenhuma.
    expect(ehFonteConhecida("whats")).toBe(false);
    expect(ehFonteConhecida("WhatsApp")).toBe(false);
  });
});

describe("qual funil recebe esta fonte", () => {
  it("devolve o funil quando algum aceita", async () => {
    const id = await funilQueAceita(dbFake({ data: { id: "funil-1" } }), "org-1", "instagram_comentario");
    expect(id).toBe("funil-1");
  });

  it("devolve null quando NENHUM aceita — e aí nada é criado", async () => {
    const id = await funilQueAceita(dbFake({ data: null }), "org-1", "instagram_comentario");
    expect(id).toBeNull();
  });

  it("ERRO DE CONSULTA NÃO É RECUSA — este é o caso que derrubaria atendimento", async () => {
    // Se um hiccup do banco virasse `null`, a mensagem do cliente seria
    // descartada em silêncio e para sempre: nada é gravado neste caminho.
    // Estourar deixa a fila reentregar.
    await expect(
      funilQueAceita(dbFake({ error: { message: "timeout" } }), "org-1", "whatsapp"),
    ).rejects.toThrow(/fontes_do_funil_indisponivel/);
  });
});
