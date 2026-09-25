/**
 * LGPD: O TEXTO CONGELADO DA CADÊNCIA SAI JUNTO COM O CONTATO.
 *
 * O motor renderiza a mensagem da cadência (nome, empresa) e a congela no job
 * (`payload.fixed_body`); o reagendamento copia o payload para `cron_jobs`.
 * Cancelar a inscrição não tocava nenhum dos dois — o texto de quem pediu para
 * ser esquecido ficava no banco. O que se prende:
 *   1. job PENDENTE de cadência é fechado (não sai) e perde o texto;
 *   2. job já enviado também perde o texto;
 *   3. reagendamento é desligado e perde o texto;
 *   4. job que NÃO é de cadência, e de OUTRO contato, não é tocado;
 *   5. segunda passada não reescreve nada (idempotente).
 */
import { describe, expect, it } from "vitest";

import { type ClienteDaCascata, completarRedacaoDoContato } from "@/lib/lgpd/cascata";

const ORG = "22222222-2222-4222-8222-222222222222";
const CONTATO = "contacts:a";

type Linha = Record<string, unknown> & { id: string };

function banco(linhas: Linha[]) {
  const escritas: Array<{ tabela: string; alvo: string; patch: Record<string, unknown> }> = [];
  const cliente = {
    from(tabela: string) {
      const construir = (modo: "select" | "update", patch: Record<string, unknown>) => {
        const filtros: Array<[string, unknown]> = [];
        let dentro: [string, string[]] | null = null;
        const q: Record<string, unknown> = {
          eq: (c: string, v: unknown) => (filtros.push([c, v]), q),
          in: (c: string, v: string[]) => ((dentro = [c, v]), q),
          limit: () => q,
          then: (r: (v: unknown) => unknown) => {
            const achadas = linhas.filter(
              (l) =>
                l.id.split(":")[0] === tabela &&
                filtros.every(([c, v]) => l[c] === v) &&
                (!dentro || dentro[1].includes(String(l[dentro[0]]))),
            );
            if (modo === "update") {
              for (const l of achadas) {
                escritas.push({ tabela, alvo: l.id, patch });
                Object.assign(l, patch);
              }
              return Promise.resolve({ error: null }).then(r);
            }
            return Promise.resolve({ data: achadas.map((l) => ({ ...l })), error: null }).then(r);
          },
        };
        return q;
      };
      return { select: () => construir("select", {}), update: (p: Record<string, unknown>) => construir("update", p) };
    },
  } as unknown as ClienteDaCascata;
  return { cliente, escritas, linhas };
}

const texto = "Oi Maria, vi a Ótica Lux";

function base(): Linha[] {
  return [
    { id: CONTATO, organization_id: ORG, is_anonymized: true },
    { id: "job_queue:pendente", organization_id: ORG, contact_id: CONTATO, status: "pending", payload: { cadencia: { pointer_id: "p" }, fixed_body: texto } },
    { id: "job_queue:enviado", organization_id: ORG, contact_id: CONTATO, status: "done", payload: { cadencia: { pointer_id: "p" }, fixed_body: texto } },
    { id: "job_queue:followup", organization_id: ORG, contact_id: CONTATO, status: "pending", payload: { fixed_body: "texto de follow-up comum" } },
    { id: "job_queue:outro", organization_id: ORG, contact_id: "contacts:b", status: "pending", payload: { cadencia: { pointer_id: "p" }, fixed_body: "Oi João" } },
    { id: "cron_jobs:reagendado", organization_id: ORG, contact_id: CONTATO, enabled: true, payload: { cadencia: { pointer_id: "p" }, fixed_body: texto } },
  ];
}

const porId = (b: ReturnType<typeof banco>, id: string) => b.linhas.find((l) => l.id === id)!;

describe("cascata LGPD × texto congelado da cadência", () => {
  it("fecha o pendente, desliga o reagendamento e tira o texto de todos", async () => {
    const b = banco(base());
    await completarRedacaoDoContato(b.cliente, { id: CONTATO, organizationId: ORG });

    const pendente = porId(b, "job_queue:pendente");
    expect(pendente.status).toBe("done");
    expect(pendente.payload).toEqual({ cadencia: { pointer_id: "p" } });

    expect(porId(b, "job_queue:enviado").payload).toEqual({ cadencia: { pointer_id: "p" } });
    expect(porId(b, "job_queue:enviado").status).toBe("done");

    const reagendado = porId(b, "cron_jobs:reagendado");
    expect(reagendado.enabled).toBe(false);
    expect(reagendado.payload).toEqual({ cadencia: { pointer_id: "p" } });
  });

  it("não toca follow-up comum nem job de outro contato", async () => {
    const b = banco(base());
    await completarRedacaoDoContato(b.cliente, { id: CONTATO, organizationId: ORG });
    expect(porId(b, "job_queue:followup").payload).toEqual({ fixed_body: "texto de follow-up comum" });
    expect(porId(b, "job_queue:followup").status).toBe("pending");
    expect(porId(b, "job_queue:outro").payload).toMatchObject({ fixed_body: "Oi João" });
  });

  it("a segunda passada não reescreve nada", async () => {
    const b = banco(base());
    await completarRedacaoDoContato(b.cliente, { id: CONTATO, organizationId: ORG });
    const antes = b.escritas.filter((e) => e.tabela === "job_queue" || e.tabela === "cron_jobs").length;
    await completarRedacaoDoContato(b.cliente, { id: CONTATO, organizationId: ORG });
    const depois = b.escritas.filter((e) => e.tabela === "job_queue" || e.tabela === "cron_jobs").length;
    expect(depois).toBe(antes);
  });
});
