import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * CERCA DE LIGAÇÃO — a saída da prospecção só chega ao cliente se o `send` de
 * cada caminho de envio automático chama `contarEnvioAutomatico` e, reservando,
 * cola `comSaida` no corpo.
 *
 * Sabotagem obrigatória: remover uma dessas chamadas deixa este teste vermelho.
 */

const RAIZ = path.resolve(__dirname, "../..");

function fonte(rel: string): string {
  return fs.readFileSync(path.join(RAIZ, rel), "utf8");
}

describe("saída configurável ligada nos envios automáticos", () => {
  it("inbound-turn.chama contarEnvioAutomatico e cola comSaida", () => {
    const src = fonte("lib/agent-engine/agent/inbound-turn.ts");
    expect(src).toContain("contarEnvioAutomatico(");
    expect(src).toContain("comSaida(");
  });

  it("followup-turn.chama contarEnvioAutomatico e cola comSaida", () => {
    const src = fonte("lib/agent-engine/agent/followup-turn.ts");
    expect(src).toContain("contarEnvioAutomatico(");
    expect(src).toContain("comSaida(");
    expect(src).toContain("desfazerContagem(");
  });

  it("followup-turn.só conta quando não é template (modelo)", () => {
    const src = fonte("lib/agent-engine/agent/followup-turn.ts");
    // A chamada de contarEnvioAutomatico deve estar protegida por `modelo === undefined`.
    const idx = src.indexOf("contarEnvioAutomatico(");
    expect(idx).toBeGreaterThan(-1);
    const trecho = src.slice(Math.max(0, idx - 200), idx);
    expect(trecho).toContain("modelo === undefined");
  });

  it("inbound-turn.chama desfazerContagem", () => {
    const src = fonte("lib/agent-engine/agent/inbound-turn.ts");
    expect(src).toContain("desfazerContagem(");
  });
});
