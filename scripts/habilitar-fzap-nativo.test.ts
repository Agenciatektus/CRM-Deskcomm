import { describe, expect, it } from "vitest";

import { desabilitar, habilitar, type Deps } from "./lib/habilitar-fzap-nativo";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const TOKEN = "tok-segredo-da-pasta-abc123";

const resp = (users: unknown[] = [], id = "pasta-1") => ({ folder: { id }, users });
const doCrm = (org = ORG) => ({ metadata: { sistema: "crm", organization_id: org } });

function fake(over: Partial<Deps> = {}) {
  const escritas: Array<[string, string, string]> = [];
  let apagadas = 0;
  const deps: Deps = {
    buscarOrg: async (id) => ({ id, status: "active" }),
    pastaAtualDaOrg: async () => null,
    donoDaPasta: async () => null,
    listarDaPasta: async () => resp(),
    cifrar: async (t) => `\\xcifrado(${t.length})`,
    gravar: async (o, f, c) => void escritas.push([o, f, c]),
    apagar: async () => ++apagadas,
    ...over,
  };
  return { deps, escritas, apagadas: () => apagadas };
}
const pedido = { orgId: ORG, pastaId: "pasta-1", token: TOKEN, aplicar: true, proxyBrPresente: true };
const texto = (r: { linhas: string[] }) => r.linhas.join("\n");

describe("habilitar", () => {
  it("dry-run não escreve e não cifra", async () => {
    let cifrou = false;
    const f = fake({ cifrar: async () => ((cifrou = true), "x") });
    const r = await habilitar(f.deps, { ...pedido, aplicar: false });
    expect(r.ok).toBe(true);
    expect(r.escreveu).toBe(false);
    expect(f.escritas).toHaveLength(0);
    expect(cifrou).toBe(false);
    expect(texto(r)).toMatch(/DRY-RUN/);
  });

  it("aplicar grava o token CIFRADO, nunca o claro, e o token não aparece na saída", async () => {
    const f = fake();
    const r = await habilitar(f.deps, pedido);
    expect(r.escreveu).toBe(true);
    expect(f.escritas[0]![2]).not.toContain(TOKEN);
    expect(texto(r)).not.toContain(TOKEN);
  });

  it("idempotente: mesma org, mesma pasta, roda de novo sem erro", async () => {
    const f = fake({ donoDaPasta: async () => ORG });
    const r = await habilitar(f.deps, pedido);
    expect(r.ok).toBe(true);
    expect(texto(r)).toMatch(/upsert idempotente/);
  });

  it("recusa pasta que é de OUTRA organização", async () => {
    const f = fake({ donoDaPasta: async () => OUTRA });
    const r = await habilitar(f.deps, pedido);
    expect(r.ok).toBe(false);
    expect(f.escritas).toHaveLength(0);
    expect(texto(r)).toMatch(/OUTRA organização/);
  });

  it("recusa organização arquivada e inexistente", async () => {
    const arq = await habilitar(fake({ buscarOrg: async (id) => ({ id, status: "archived" }) }).deps, pedido);
    expect(arq.ok).toBe(false);
    expect(texto(arq)).toMatch(/não está ativa/);
    const nao = await habilitar(fake({ buscarOrg: async () => null }).deps, pedido);
    expect(texto(nao)).toMatch(/não existe/);
  });

  it("uuid inválido e token ausente são recusados", async () => {
    expect((await habilitar(fake().deps, { ...pedido, orgId: "abc" })).ok).toBe(false);
    expect((await habilitar(fake().deps, { ...pedido, token: "" })).ok).toBe(false);
  });

  it("401 do FZAP falha sem vazar o token, mesmo se o erro o ecoar", async () => {
    const f = fake({
      listarDaPasta: async () => {
        throw new Error(`verdash_request_failed: 401 invalid ${TOKEN}`);
      },
    });
    const r = await habilitar(f.deps, pedido);
    expect(r.ok).toBe(false);
    expect(texto(r)).toMatch(/401/);
    expect(texto(r)).not.toContain(TOKEN);
    expect(f.escritas).toHaveLength(0);
  });

  it("erro de rede com o token no texto não vaza", async () => {
    const f = fake({
      listarDaPasta: async () => {
        throw new Error(`verdash_unreachable: boom ${TOKEN}`);
      },
    });
    expect(texto(await habilitar(f.deps, pedido))).not.toContain(TOKEN);
  });

  it("pasta do FZAP diferente de --pasta, ou com instância de outra org, é recusada", async () => {
    const a = await habilitar(fake({ listarDaPasta: async () => resp([], "outra") }).deps, pedido);
    expect(a.ok).toBe(false);
    const b = await habilitar(fake({ listarDaPasta: async () => resp([doCrm(OUTRA)]) }).deps, pedido);
    expect(b.ok).toBe(false);
  });

  it("resposta sem folder.id ou com users que não é array: RECUSA (não só avisa)", async () => {
    for (const bruto of [[], {}, null, { users: [] }, { folder: { id: "pasta-1" } }, { folder: { id: "pasta-1" }, users: "x" }]) {
      const f = fake({ listarDaPasta: async () => bruto as never });
      const r = await habilitar(f.deps, pedido);
      expect(r.ok).toBe(false);
      expect(f.escritas).toHaveLength(0);
    }
  });

  it("recusa pasta com instância SEM metadata.sistema=crm; pasta vazia e só do CRM passam", async () => {
    const f = fake({ listarDaPasta: async () => resp([{ metadata: { organization_id: ORG } }]) });
    expect((await habilitar(f.deps, pedido)).ok).toBe(false);
    expect((await habilitar(fake({ listarDaPasta: async () => resp([{}]) }).deps, pedido)).ok).toBe(false);
    expect((await habilitar(fake().deps, pedido)).ok).toBe(true);
    expect((await habilitar(fake({ listarDaPasta: async () => resp([doCrm()]) }).deps, pedido)).ok).toBe(true);
  });

  it("org que já usa OUTRA pasta: recusa trocar em silêncio; mesma pasta é idempotente", async () => {
    const f = fake({ pastaAtualDaOrg: async () => "pasta-antiga" });
    const r = await habilitar(f.deps, pedido);
    expect(r.ok).toBe(false);
    expect(texto(r)).toMatch(/já usa a pasta pasta-antiga; desabilite e migre os canais antes/);
    expect(f.escritas).toHaveLength(0);
    const g = fake({ pastaAtualDaOrg: async () => "pasta-1", donoDaPasta: async () => ORG });
    expect((await habilitar(g.deps, pedido)).ok).toBe(true);
  });

  it("--pasta com espaços: o valor normalizado é o usado em tudo (confere, dono, gravação)", async () => {
    const f = fake();
    const r = await habilitar(f.deps, { ...pedido, pastaId: "  pasta-1 " });
    expect(r.ok).toBe(true);
    expect(f.escritas[0]![1]).toBe("pasta-1");
  });

  it("avisa sem proxy, sem imprimir valor", async () => {
    const r = await habilitar(fake().deps, { ...pedido, proxyBrPresente: false });
    expect(r.ok).toBe(true);
    expect(texto(r)).toMatch(/FZAP_PROXY_URL_BR ausente/);
  });

  it("cifra indisponível não grava", async () => {
    const f = fake({ cifrar: async () => null });
    const r = await habilitar(f.deps, pedido);
    expect(r.ok).toBe(false);
    expect(f.escritas).toHaveLength(0);
  });
});

describe("desabilitar", () => {
  it("dry-run não apaga; --aplicar apaga", async () => {
    const f = fake();
    await desabilitar(f.deps, { orgId: ORG, aplicar: false });
    expect(f.apagadas()).toBe(0);
    const r = await desabilitar(f.deps, { orgId: ORG, aplicar: true });
    expect(r.escreveu).toBe(true);
    expect(f.apagadas()).toBe(1);
  });
  it("uuid inválido é recusado", async () => {
    expect((await desabilitar(fake().deps, { orgId: "x", aplicar: true })).ok).toBe(false);
  });
});
