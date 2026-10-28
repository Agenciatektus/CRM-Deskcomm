import type pg from "pg";
import { describe, expect, it, vi } from "vitest";

import { conversaEmLacoComRobo } from "./consulta-laco";

const agora = new Date("2026-10-28T12:00:00Z");
const input = { organizationId: "org-1", conversationId: "conv-1", agora };
const linha = (direction: string, body: string, min: number, via: string | null = null) => ({
  direction,
  body,
  sent_at: new Date(agora.getTime() - min * 60_000),
  sent_via: via,
});
const poolCom = (rows: unknown[] | Error) => {
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes("update conversations")) return { rows: [] };
    if (rows instanceof Error) throw rows;
    return { rows };
  });
  return { query, pool: { query } as unknown as pg.Pool };
};
const log = () => ({ warn: vi.fn() });

describe("conversaEmLacoComRobo", () => {
  it("laço: silencia a conversa (org + id) e loga o motivo", async () => {
    const rows = [
      ...Array.from({ length: 16 }, (_, i) => linha("outbound", `r${i}`, i + 1, "ai")),
      ...Array.from({ length: 12 }, (_, i) => linha("inbound", `c${i}`, i + 1)),
    ];
    const { pool, query } = poolCom(rows);
    const l = log();
    expect(await conversaEmLacoComRobo(pool, input, l)).toBe(true);
    const upd = query.mock.calls.find((c) => String(c[0]).includes("update conversations"));
    expect(String(upd?.[0])).toContain("'infinity'");
    expect(String(upd?.[0])).not.toContain("last_handoff_at");
    expect(upd?.[1]).toEqual(["org-1", "conv-1", "Automático pausado: laço com robô (volume)"]);
    expect(l.warn.mock.calls[0]?.[1]).toMatchObject({ motivo: "volume", conversation_id: "conv-1" });
  });

  it("external_device (vendedor pelo celular) não conta como IA", async () => {
    const rows = [
      ...Array.from({ length: 16 }, (_, i) => linha("outbound", `r${i}`, i + 1, "external_device")),
      ...Array.from({ length: 12 }, (_, i) => linha("inbound", `c${i}`, i + 1)),
    ];
    expect(await conversaEmLacoComRobo(poolCom(rows).pool, input, log())).toBe(false);
  });

  it("conversa normal: não silencia", async () => {
    const rows = [linha("inbound", "oi", 5), linha("outbound", "olá", 4), linha("inbound", "preço?", 3)];
    const { pool, query } = poolCom(rows);
    expect(await conversaEmLacoComRobo(pool, input, log())).toBe(false);
    expect(query.mock.calls.some((c) => String(c[0]).includes("update"))).toBe(false);
  });

  it("leitura que falha segue como hoje (fail-open) e loga", async () => {
    const l = log();
    expect(await conversaEmLacoComRobo(poolCom(new Error("boom")).pool, input, l)).toBe(false);
    expect(l.warn).toHaveBeenCalled();
  });
});
