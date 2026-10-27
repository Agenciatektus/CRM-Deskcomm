/**
 * O JEV DA PLATAFORMA, a estrutura por baixo (fatia 2): o SQL do pool, o nome da
 * chave estrangeira da consulta embutida, as migrations 9076 e 9077 lidas como
 * declarações (e não como texto solto) e o schema do plano.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type pg from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const avisos = vi.hoisted(() => [] as Array<[string, Record<string, unknown>]>);
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (msg: string, ctx: Record<string, unknown>) => avisos.push([msg, ctx]),
    info: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));
vi.mock("@/lib/env", () => ({ env: {} }));

import { ESTADOS_COM_JEV, organizacaoElegivelAoJevNoPool } from "@/lib/ai/decisao/elegibilidade";
import { edicaoDoPlanoSchema, novoPlanoSchema } from "@/lib/schemas/cobranca-plano";

const RAIZ = process.cwd();
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");
const MIGRATION_9076 = "supabase/migrations/20261027120000_9076_cobranca_planos_inclui_ia.sql";
const MIGRATION_9077 = "supabase/migrations/20261027180000_9077_cobranca_planos_inclui_ia_corretiva.sql";

/** Declarações da migration, sem comentário de linha, normalizadas. */
function declaracoes(sql: string): string[] {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((d) => d.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((d) => d !== "");
}

/** As condições de um `where`, separadas por `and`. */
function condicoes(declaracao: string): string[] {
  const onde = declaracao.split(" where ")[1] ?? "";
  return onde.split(" and ").map((c) => c.trim());
}

/** O bloco `Row` de uma tabela em `database.types.ts` (gerado a partir do schema). */
function colunasDaTabela(tabela: string): string[] {
  const tipos = ler("lib/database.types.ts");
  const inicio = tipos.indexOf(`      ${tabela}: {`);
  expect(inicio, `tabela ${tabela} em database.types.ts`).toBeGreaterThan(-1);
  const row = tipos.slice(tipos.indexOf("Row: {", inicio), tipos.indexOf("Insert: {", inicio));
  return [...row.matchAll(/^\s+([a-z_]+)\??:/gm)].map((m) => m[1]!);
}

describe("organizacaoElegivelAoJevNoPool (o caminho do roteador, pela pilha do agente)", () => {
  let consultas: Array<{ sql: string; params: unknown[] }>;
  const poolCom = (rows: unknown[] | Error) =>
    ({
      query: async (sql: string, params: unknown[]) => {
        consultas.push({ sql: sql.replace(/\s+/g, " ").trim().toLowerCase(), params });
        if (rows instanceof Error) throw rows;
        return { rows };
      },
    }) as unknown as pg.Pool;

  beforeEach(() => {
    consultas = [];
    avisos.length = 0;
  });

  it("o SQL junta assinatura e plano pela chave certa, filtra a empresa e exige inclui_ia sem ia_propria", async () => {
    await organizacaoElegivelAoJevNoPool(poolCom([]), "org-1");
    const [{ sql, params }] = consultas as [{ sql: string; params: unknown[] }];
    expect(sql).toContain("from public.cobranca_assinaturas a join public.cobranca_planos p on p.id = a.plano_id");
    expect(condicoes(sql)).toEqual(["a.organization_id = $1", "a.estado = any($2::text[])", "p.inclui_ia", "not p.ia_propria"]);
    expect(params).toEqual(["org-1", ["trial", "ativa", "em_atraso"]]);
    expect(params[1]).toEqual([...ESTADOS_COM_JEV]);
  });

  it("toda coluna do SQL existe nas tabelas (nome errado acusa aqui, não em produção)", () => {
    const assinaturas = colunasDaTabela("cobranca_assinaturas");
    const planos = colunasDaTabela("cobranca_planos");
    expect(assinaturas).toEqual(expect.arrayContaining(["organization_id", "estado", "plano_id"]));
    expect(planos).toEqual(expect.arrayContaining(["id", "inclui_ia", "ia_propria"]));
  });

  it("linha devolvida => elegível; nenhuma => não (controle negativo)", async () => {
    expect(await organizacaoElegivelAoJevNoPool(poolCom([{ "?column?": 1 }]), "org-1")).toBe(true);
    expect(await organizacaoElegivelAoJevNoPool(poolCom([]), "org-1")).toBe(false);
  });

  it("erro do banco => não elegível, e o log leva só a classe do erro", async () => {
    const erro = Object.assign(new Error("senha=segredo_do_banco"), { name: "PgError" });
    expect(await organizacaoElegivelAoJevNoPool(poolCom(erro), "org-1")).toBe(false);
    expect(JSON.stringify(avisos)).toContain("PgError");
    expect(JSON.stringify(avisos)).not.toContain("segredo_do_banco");
  });
});

describe("a consulta embutida da elegibilidade usa a chave estrangeira que existe", () => {
  const fonte = ler("lib/ai/decisao/elegibilidade.ts");
  const dica = fonte.match(/cobranca_planos!([a-z_]+)\(/)?.[1];

  it("a dica da consulta é exatamente o nome gerado da FK plano_id", () => {
    expect(dica).toBe("cobranca_assinaturas_plano_id_fkey");
  });

  it("essa FK existe em database.types.ts, sobre plano_id, apontando para cobranca_planos", () => {
    const tipos = ler("lib/database.types.ts");
    const bloco = tipos.slice(tipos.indexOf(`foreignKeyName: "${dica}"`));
    const fk = bloco.slice(0, bloco.indexOf("}"));
    expect(fk).toContain('columns: ["plano_id"]');
    expect(fk).toContain('referencedRelation: "cobranca_planos"');
  });

  it("e o nome é o que o Postgres dá à FK declarada em linha na migration 0583", () => {
    const sql = declaracoes(ler("supabase/migrations/20261007130926_0583_cobranca_planos_e_assinaturas.sql")).join(" ");
    // `<tabela>_<coluna>_fkey` é o nome padrão de `plano_id ... references cobranca_planos(id)` sem `constraint`.
    expect(sql).toContain("plano_id uuid not null references public.cobranca_planos(id)");
    expect(sql).not.toContain("constraint cobranca_assinaturas_plano_id");
  });

  it("existe a segunda FK para o plano (agendado): sem a dica a consulta seria ambígua", () => {
    expect(ler("lib/database.types.ts")).toContain('foreignKeyName: "cobranca_assinaturas_plano_agendado_id_fkey"');
  });
});

describe("migration 9076, lida como declarações", () => {
  const d = declaracoes(ler(MIGRATION_9076));

  it("inclui_ia nasce boolean not null default false, com if not exists", () => {
    const alter = d.find((x) => x.startsWith("alter table public.cobranca_planos"));
    expect(alter).toBe("alter table public.cobranca_planos add column if not exists inclui_ia boolean not null default false");
  });

  it("um único update, que marca só o plano mensal vivo de R$ 397 sem IA própria e ainda não marcado", () => {
    const updates = d.filter((x) => x.startsWith("update "));
    expect(updates).toHaveLength(1);
    const [update] = updates as [string];
    expect(update.startsWith("update public.cobranca_planos set inclui_ia = true where")).toBe(true);
    expect(condicoes(update).sort()).toEqual(
      ["arquivado_em is null", "ia_propria = false", "inclui_ia = false", "intervalo = 'mes'", "preco_cents = 39700"].sort(),
    );
  });

  it("o baseline leva a migration inteira, sem diferença", () => {
    const baseline = ler("supabase/baseline.sql");
    const corpo = ler(MIGRATION_9076).split("set lock_timeout = '3s';\n")[1]!.trim();
    expect(baseline).toContain(corpo);
  });
});

describe("migration 9077 (corretiva), lida como declarações", () => {
  const d = declaracoes(ler(MIGRATION_9077));

  it("desfaz a marca só em plano de R$ 397 que não é BRL e está marcado (idempotente)", () => {
    const updates = d.filter((x) => x.startsWith("update "));
    expect(updates).toHaveLength(1);
    const [update] = updates as [string];
    expect(update.startsWith("update public.cobranca_planos set inclui_ia = false where")).toBe(true);
    expect(condicoes(update).sort()).toEqual(["inclui_ia = true", "moeda <> 'brl'", "preco_cents = 39700"].sort());
  });

  it("cria a trava inclui_ia x ia_propria uma vez só, sem validar linha antiga", () => {
    const bloco = (d.find((x) => x.startsWith("do $$")) ?? "").replace(/\s+/g, "");
    expect(bloco).toContain("ifnotexists(select1frompg_constraintwhereconname='cobranca_planos_ia_exclusivos'");
    expect(bloco).toContain("check(not(inclui_iaandia_propria))notvalid");
  });

  it("o baseline leva a migration inteira, sem diferença", () => {
    const corpo = ler(MIGRATION_9077).split("set lock_timeout = '3s';\n")[1]!.trim();
    expect(ler("supabase/baseline.sql")).toContain(corpo);
  });

  it("a 9077 é posterior à 9076 na cadeia", () => {
    expect(MIGRATION_9077.split("/").pop()! > MIGRATION_9076.split("/").pop()!).toBe(true);
  });
});

describe("schema do plano: IA incluída e IA própria se excluem", () => {
  const base = { nome: "Pro", preco_cents: 39700, intervalo: "mes", trial_dias: 7 };

  it("novo plano: cada uma sozinha passa; as duas juntas, não", () => {
    expect(novoPlanoSchema.safeParse({ ...base, inclui_ia: true }).success).toBe(true);
    expect(novoPlanoSchema.safeParse({ ...base, ia_propria: true }).success).toBe(true);
    expect(novoPlanoSchema.safeParse({ ...base, inclui_ia: true, ia_propria: false }).success).toBe(true);
    expect(novoPlanoSchema.safeParse({ ...base, inclui_ia: true, ia_propria: true }).success).toBe(false);
  });

  it("edição: o mesmo", () => {
    expect(edicaoDoPlanoSchema.safeParse({ inclui_ia: true }).success).toBe(true);
    expect(edicaoDoPlanoSchema.safeParse({ inclui_ia: true, ia_propria: true }).success).toBe(false);
  });
});
