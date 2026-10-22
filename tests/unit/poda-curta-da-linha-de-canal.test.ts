import { describe, expect, it } from "vitest";

import { apagarLinhasDeCanalVencidas } from "@/lib/channels/poda-das-linhas-de-canal";
import { ErroAoApagarLinhasVelhas, podarArquivoDeWebhooks } from "@/lib/channels/retencao-do-arquivo";

/**
 * A LINHA DE CANAL SAI EM D+30; A SEM CANAL CONTINUA EM D+90.
 *
 * Os leitores da linha sem canal (último aviso do Stripe/Asaas, últimos 20
 * recebimentos de uma fonte, pedido de LGPD da Nuvemshop) leem sem janela —
 * encurtar ali apagaria o que uma tela mostra. Por isso o DELETE curto TEM de
 * filtrar `channel_session_id is not null`, e é isso que o primeiro caso mede.
 */

interface Cadeia {
  op: string;
  nao: Array<[string, string, unknown]>;
  menorQue: Array<[string, string]>;
  ordem?: string;
  lote?: number;
  projecao?: string;
}

function fakeAdmin(opts: { apagaCanal?: number; erroCanal?: string } = {}) {
  const cadeias: Cadeia[] = [];
  const admin = {
    from() {
      const c: Cadeia = { op: "", nao: [], menorQue: [] };
      const q: Record<string, unknown> = {
        select(cols?: string) { if (!c.op) c.op = "select"; if (cols) c.projecao = cols; return q; },
        is() { return q; },
        not(col: string, op: string, v: unknown) { c.nao.push([col, op, v]); return q; },
        lt(col: string, v: string) { c.menorQue.push([col, v]); return q; },
        lte() { return q; },
        order(col: string) { c.ordem = col; return q; },
        update() { c.op = "update"; return q; },
        delete() { c.op = "delete"; return q; },
        limit(n: number) {
          c.lote = n;
          cadeias.push(c);
          // O DUBLÊ RECUSA O QUE O POSTGREST RECUSA. Num DELETE com retorno, o
          // PostgREST ordena pela REPRESENTAÇÃO: ordenar por coluna fora do
          // `select` devolve `column <tabela>.<col> does not exist`, com a
          // coluna existindo no banco. O dublê antigo aceitava qualquer
          // `order`, então o defeito passou verde aqui e só apareceu em
          // produção, no cron, 5 minutos depois da release #259.
          if (c.op === "delete" && c.ordem) {
            const projetadas = (c.projecao ?? "").split(",").map((x) => x.trim());
            if (!projetadas.includes(c.ordem)) {
              return Promise.resolve({
                data: null,
                error: { message: `column webhook_events_log.${c.ordem} does not exist` },
              });
            }
          }
          const canal = c.nao.some(([col]) => col === "channel_session_id");
          if (canal && opts.erroCanal) return Promise.resolve({ data: null, error: { message: opts.erroCanal } });
          if (canal) return Promise.resolve({ data: Array.from({ length: opts.apagaCanal ?? 0 }, (_, i) => ({ id: `c${i}` })), error: null });
          return Promise.resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
  return { admin: admin as never, cadeias };
}

const deleteDeCanal = (cs: Cadeia[]) =>
  cs.filter((c) => c.op === "delete" && c.nao.some(([col]) => col === "channel_session_id"));

describe("apagarLinhasDeCanalVencidas", () => {
  it("só linha COM canal, mais velha que o horizonte, em lote ordenado por received_at", async () => {
    const { admin, cadeias } = fakeAdmin({ apagaCanal: 3 });
    const agora = new Date("2026-10-21T12:00:00.000Z");
    const n = await apagarLinhasDeCanalVencidas(admin, { dias: 30, lote: 500, agora });
    expect(n).toBe(3);
    const [c] = deleteDeCanal(cadeias);
    expect(c?.nao).toEqual([["channel_session_id", "is", null]]);
    expect(c?.menorQue).toEqual([["received_at", "2026-09-21T12:00:00.000Z"]]);
    // A ordem é a do índice parcial da 9064, e o `order` existe (PGRST109).
    expect(c?.ordem).toBe("received_at");
    // E a coluna ordenada ESTÁ na projeção: é isso que o PostgREST exige num
    // DELETE com retorno, e é o que faltava na #259.
    expect(c?.projecao?.split(",").map((x) => x.trim())).toContain("received_at");
    expect(c?.lote).toBe(500);
  });

  it("recusa do banco SOBE (não vira `0 apagadas`)", async () => {
    const { admin } = fakeAdmin({ erroCanal: "canceling statement due to statement timeout" });
    await expect(apagarLinhasDeCanalVencidas(admin, { dias: 30, lote: 500 })).rejects.toThrow(/statement timeout/);
  });
});

describe("podarArquivoDeWebhooks com o horizonte de canal", () => {
  it("sem o knob, o comportamento é o de antes: nenhum DELETE de canal", async () => {
    const { admin, cadeias } = fakeAdmin({ apagaCanal: 9 });
    const r = await podarArquivoDeWebhooks(admin, { diasComCorpo: 7, diasParaApagar: 90 });
    expect(deleteDeCanal(cadeias)).toHaveLength(0);
    expect(r.apagadas).toBe(0);
  });

  it("knob igual ou maior que o horizonte geral = desligado", async () => {
    const { admin, cadeias } = fakeAdmin({ apagaCanal: 9 });
    await podarArquivoDeWebhooks(admin, { diasComCorpo: 7, diasParaApagar: 90, diasParaApagarCanal: 90 });
    expect(deleteDeCanal(cadeias)).toHaveLength(0);
  });

  it("com 30: apaga o lote de canal e soma em `apagadas`, no MESMO lote da rodada", async () => {
    const { admin, cadeias } = fakeAdmin({ apagaCanal: 4 });
    const r = await podarArquivoDeWebhooks(admin, {
      diasComCorpo: 7,
      diasParaApagar: 90,
      diasParaApagarCanal: 30,
      lote: 50,
    });
    expect(r.apagadas).toBe(4);
    expect(deleteDeCanal(cadeias)[0]?.lote).toBe(50);
  });

  it("falha no DELETE de canal sobe como ErroAoApagarLinhasVelhas, com o parcial", async () => {
    const { admin } = fakeAdmin({ erroCanal: "boom" });
    const erro = await podarArquivoDeWebhooks(admin, {
      diasComCorpo: 7,
      diasParaApagar: 90,
      diasParaApagarCanal: 30,
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroAoApagarLinhasVelhas);
    expect((erro as ErroAoApagarLinhasVelhas).parcial).toEqual({ esvaziadas: 0, apagadas: 0, temMais: false });
  });
});
