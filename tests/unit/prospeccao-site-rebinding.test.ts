/**
 * DNS REBINDING no enriquecimento pelo site (P1 do @Cassio_SecRev, revisão da #78).
 *
 * O site vem do Google Maps — host arbitrário. O DNS do atacante responde
 * PÚBLICO na conferência (`julgarHost`) e INTERNO na conexão. Antes, o `fetch`
 * resolvia o nome de novo e conectava no interno. Agora a conexão sai por
 * `fetchComDestinoFixado`, cujo `lookup` usa o mesmo resolvedor (c-ares) e
 * JULGA o que recebe: o interno é recusado como `unsafe_url:private_ip`, antes
 * de qualquer byte sair.
 *
 * Sem dublê de rede: o `fetchComDestinoFixado` é o de verdade. Só o DNS é
 * dublê (sequência de respostas por nome) e o logger é observado — é ele que
 * distingue "recusado pela guarda" de "site fora do ar".
 */
import type * as DnsPromises from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { DNS, avisos } = vi.hoisted(() => ({
  /** Cada consulta consome a próxima resposta do nome. */
  DNS: {} as Record<string, string[][]>,
  avisos: [] as Array<Record<string, unknown>>,
}));

vi.mock("node:dns/promises", async (importOriginal) => {
  const real = await importOriginal<typeof DnsPromises>();
  class Resolver {
    cancel() {}
    async resolve4(host: string) {
      const fila = DNS[host];
      if (!fila || fila.length === 0) throw new Error("ENOTFOUND");
      return fila.length > 1 ? fila.shift()! : fila[0]!;
    }
    async resolve6() {
      return [];
    }
  }
  return { ...real, default: { ...real, Resolver }, Resolver };
});
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (_m: string, meta: Record<string, unknown>) => avisos.push(meta),
    info: () => {},
    error: () => {},
  },
}));

import { lerPaginaPublica } from "@/lib/prospecting/enriquecer-pelo-site";

beforeEach(() => {
  for (const k of Object.keys(DNS)) delete DNS[k];
  avisos.length = 0;
});

describe("enriquecimento pelo site: DNS rebinding", () => {
  it("conferência vê público, conexão veria 127.0.0.1: recusado pela GUARDA na conexão", async () => {
    // 1ª resposta: a de `julgarHost` (pública). 2ª: a do lookup da conexão (interna).
    DNS["rebind.atacante.exemplo"] = [["93.184.216.34"], ["127.0.0.1"]];
    expect(await lerPaginaPublica("https://rebind.atacante.exemplo/")).toBe("");
    expect(avisos).toEqual([
      expect.objectContaining({ hostname: "rebind.atacante.exemplo", motivo: "unsafe_url:private_ip", salto: 0 }),
    ]);
    // As duas respostas foram consumidas: a conexão resolveu e julgou a SUA.
    expect(DNS["rebind.atacante.exemplo"]).toEqual([["127.0.0.1"]]);
  });

  it("o mesmo para o metadata da nuvem e para a rede do compose", async () => {
    DNS["meta.atacante.exemplo"] = [["93.184.216.34"], ["169.254.169.254"]];
    DNS["compose.atacante.exemplo"] = [["93.184.216.34"], ["172.18.0.5"]];
    expect(await lerPaginaPublica("https://meta.atacante.exemplo/")).toBe("");
    expect(await lerPaginaPublica("https://compose.atacante.exemplo/")).toBe("");
    expect(avisos.map((a) => a.motivo)).toEqual(["unsafe_url:private_ip", "unsafe_url:private_ip"]);
  });

  it("só https na 443: http e porta fora do padrão são recusados pela guarda", async () => {
    DNS["padaria.exemplo"] = [["93.184.216.34"]];
    expect(await lerPaginaPublica("http://padaria.exemplo/")).toBe("");
    expect(await lerPaginaPublica("https://padaria.exemplo:8443/")).toBe("");
    expect(avisos.map((a) => a.motivo)).toEqual(["unsafe_url:https_required", "unsafe_url:port_8443"]);
  });
});
