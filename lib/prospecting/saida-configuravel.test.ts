import { describe, expect, it, vi } from "vitest";

import { contarEnvioAutomatico, desfazerContagem } from "@/lib/prospecting/saida-configuravel";

/**
 * Teste do helper de contagem/reserva da saída com db falso: registra SQL e
 * params, sem banco de verdade.
 */

function dbFalso(respostas: Record<string, unknown[]> = {}) {
  const sqls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    sqls.push({ sql, params: [...params] });
    const chave = Object.keys(respostas).find((k) => sql.includes(k));
    const rows = chave ? respostas[chave] : [];
    return { rows };
  });
  return { query, sqls };
}

describe("contarEnvioAutomatico", () => {
  it("filtra organization_id em toda consulta e devolve levaASaida do retorno", async () => {
    const agora = new Date("2026-10-21T13:00:00Z").toISOString();
    const { query, sqls } = dbFalso({
      "returning": [
        {
          candidato_id: "cand-1",
          campanha_id: "camp-1",
          exit_offered_at: agora,
          leva_a_saida: true,
          numero_da_mensagem: 1,
          locale: "pt-BR",
          reservada_em_texto: agora,
        },
      ],
    });
    const r = await contarEnvioAutomatico({ query } as never, "org-a", "conv-1");
    expect(r).toMatchObject({
      candidatoId: "cand-1",
      campanhaId: "camp-1",
      levaASaida: true,
      reservadaEm: agora,
      locale: "pt-BR",
      numeroDaMensagem: 1,
    });
    // Toda SQL carrega organization_id = $1.
    for (const { sql, params } of sqls) {
      expect(sql).toContain("organization_id = $1");
      expect(params[0]).toBe("org-a");
    }
  });

  it("não reserva quando leva_a_saida=false, ainda que exit_offered_at esteja preenchido", async () => {
    const { query, sqls } = dbFalso({
      "returning": [
        {
          candidato_id: "cand-2",
          campanha_id: "camp-2",
          exit_offered_at: "2026-10-21T12:00:00Z",
          leva_a_saida: false,
          numero_da_mensagem: 2,
          locale: null,
        },
      ],
    });
    const r = await contarEnvioAutomatico({ query } as never, "org-a", "conv-2");
    expect(r!.levaASaida).toBe(false);
    // reservadaEm deve ser null: este envio não foi quem reservou.
    expect(r!.reservadaEm).toBeNull();
    expect(r!.numeroDaMensagem).toBe(2);
    for (const { sql } of sqls) expect(sql).toContain("organization_id = $1");
  });

  it("devolve null quando não há candidato", async () => {
    const { query } = dbFalso({});
    const r = await contarEnvioAutomatico({ query } as never, "org-a", "conv-1");
    expect(r).toBeNull();
  });
});

describe("desfazerContagem", () => {
  it("manda o reservadaEm no terceiro parâmetro", async () => {
    const { query, sqls } = dbFalso({});
    await desfazerContagem({ query } as never, "org-a", "cand-x", "2026-10-21T13:00:00Z");
    const ultima = sqls[sqls.length - 1];
    expect(ultima).toBeDefined();
    expect(ultima!.sql).toContain("organization_id = $1");
    expect(ultima!.params).toEqual(["org-a", "cand-x", "2026-10-21T13:00:00Z"]);
    expect(ultima!.sql).toContain("greatest(automatic_sends - 1, 0)");
  });
});
