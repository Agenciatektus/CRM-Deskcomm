// ─── A assinatura do reenvio de Instagram ──────────────────────────────────
//
// O segredo é POR VÍNCULO, e é isso que transforma um bug de roteamento em 401
// em vez de vazamento entre organizações: com um segredo global, uma entrega
// endereçada errado chegaria na organização de outro cliente COM ASSINATURA
// VÁLIDA, porque a assinatura provaria apenas "veio da plataforma" — nunca "é
// para você".
//
// Por isso o caso do segredo trocado abaixo não é zelo: ele é o próprio
// invariante multi-tenant deste canal.

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verificarAssinaturaDoInstagram } from "@/lib/channels/instagram/webhook";

const SEGREDO = "segredo-deste-vinculo-com-tamanho-suficiente";
const CORPO = JSON.stringify({ tipo: "direct", provider_message_id: "mid-1" });

function assinar(corpo: string, segredo: string): string {
  return "sha256=" + createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");
}

describe("assinatura do reenvio de Instagram", () => {
  it("aceita a assinatura correta", () => {
    expect(verificarAssinaturaDoInstagram(CORPO, assinar(CORPO, SEGREDO), SEGREDO)).toBe(true);
  });

  it("RECUSA assinatura feita com o segredo de outro vínculo", () => {
    const deOutroCliente = assinar(CORPO, "segredo-de-outra-organizacao-qualquer");
    expect(
      verificarAssinaturaDoInstagram(CORPO, deOutroCliente, SEGREDO),
      "entrega endereçada à organização errada tem de falhar a autenticação",
    ).toBe(false);
  });

  it("RECUSA corpo adulterado no caminho", () => {
    const assinatura = assinar(CORPO, SEGREDO);
    const adulterado = JSON.stringify({ tipo: "direct", provider_message_id: "mid-OUTRO" });
    expect(verificarAssinaturaDoInstagram(adulterado, assinatura, SEGREDO)).toBe(false);
  });

  it("recusa o que não tem forma de assinatura, sem estourar", () => {
    const casos: [string, string | null][] = [
      ["sem header", null],
      ["sem o prefixo", createHmac("sha256", SEGREDO).update(CORPO).digest("hex")],
      ["prefixo de outro algoritmo", "sha1=" + "a".repeat(40)],
      ["hex curto demais", "sha256=abc"],
      ["hex com caractere inválido", "sha256=" + "z".repeat(64)],
      ["vazio", ""],
    ];
    for (const [nome, header] of casos) {
      expect(verificarAssinaturaDoInstagram(CORPO, header, SEGREDO), nome).toBe(false);
    }
  });

  it("RECUSA a assinatura certa apresentada sob outro algoritmo", () => {
    // `sha512=` tem os MESMOS 7 caracteres de `sha256=`. Sem a conferencia do
    // prefixo, o `slice` devolveria o hex INTEIRO e correto, e a comparacao
    // aprovaria — o header estaria afirmando um algoritmo e sendo conferido
    // como outro.
    //
    // Este caso nasceu de um controle negativo que FALHOU em falhar: removi o
    // `startsWith` do produto e nenhum teste caiu, porque todos os casos de
    // prefixo errado tambem tinham hex invalido e morriam na regex. Um teste
    // que so reprova por um segundo motivo nao esta medindo o primeiro.
    const certa = assinar(CORPO, SEGREDO).slice("sha256=".length);
    expect(verificarAssinaturaDoInstagram(CORPO, `sha512=${certa}`, SEGREDO)).toBe(false);
  });

  it("sem segredo decifrado, nada passa", () => {
    // `secret: null` é o que a rota entrega quando a cifra falha. Aceitar aqui
    // abriria o canal para qualquer um que soubesse a URL do webhook.
    expect(verificarAssinaturaDoInstagram(CORPO, assinar(CORPO, SEGREDO), null)).toBe(false);
  });

  it("a comparação é em tempo constante — não sai cedo no primeiro byte", () => {
    // Não dá para medir tempo de forma estável num teste, então o que se cobra
    // é o comportamento observável que o `timingSafeEqual` garante: duas
    // assinaturas erradas, uma quase certa e outra totalmente diferente, são
    // recusadas igual.
    const certa = assinar(CORPO, SEGREDO).slice("sha256=".length);
    const quaseCerta = "sha256=" + certa.slice(0, 63) + (certa[63] === "a" ? "b" : "a");
    const totalmenteDiferente = "sha256=" + "0".repeat(64);
    expect(verificarAssinaturaDoInstagram(CORPO, quaseCerta, SEGREDO)).toBe(false);
    expect(verificarAssinaturaDoInstagram(CORPO, totalmenteDiferente, SEGREDO)).toBe(false);
  });
});
