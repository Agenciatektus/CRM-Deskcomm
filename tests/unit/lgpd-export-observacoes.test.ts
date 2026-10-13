import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mock.admin }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
import { collectExportData } from "@/lib/lgpd/export-collector";

type Row = Record<string, unknown>;
const ORG = "tenant-a",
  OTHER_ORG = "tenant-b",
  CONTACT = "contact-a",
  OTHER_CONTACT = "contact-b";
const request = {
  organizationId: ORG,
  requestId: "export-observacoes",
  contactId: CONTACT,
  externalCustomerId: null,
};
let rows: Record<string, Row[]>;
const reads: { table: string; columns: string; range: [number, number] }[] = [];

class ReadQuery {
  columns = "";
  filters: [string, unknown][] = [];
  inFilters: [string, unknown[]][] = [];
  page: [number, number] = [0, 1000];
  constructor(readonly table: string) {}
  select(columns: string) {
    this.columns = columns;
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.inFilters.push([key, values]);
    return this;
  }
  order() {
    return this;
  }
  limit(limit: number) {
    this.page = [0, limit - 1];
    return this;
  }
  range(from: number, to: number) {
    this.page = [from, to];
    return this;
  }
  or() {
    return this;
  }
  async maybeSingle() {
    const result = await this.execute();
    return { ...result, data: result.data?.[0] ?? null };
  }
  then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
    return this.execute().then(resolve, reject);
  }
  async execute() {
    reads.push({ table: this.table, columns: this.columns, range: this.page });
    const data = (rows[this.table] ?? [])
      .filter((row) => this.filters.every(([key, value]) => row[key] === value))
      .filter((row) => this.inFilters.every(([key, values]) => values.includes(row[key])))
      .slice(this.page[0], this.page[1] + 1)
      .map((row) =>
        Object.fromEntries(
          this.columns
            .split(",")
            .map((column) => column.trim())
            .map((column) => [column, row[column]]),
        ),
      );
    return { data, error: null };
  }
}

/**
 * O EXPORT LGPD LEVA AS OBSERVAÇÕES DO CONTATO (migration 9041): anotação livre
 * da equipe sobre o titular é dado pessoal, e o direito de acesso a alcança.
 */
const OBS = "prefere ligação à tarde; já comprou na loja física";

beforeEach(() => {
  reads.length = 0;
  rows = {
    organizations: [{ id: ORG, legal_name: "Empresa Teste", display_name: "Teste", dpo_email: null }],
    contacts: [
      { id: CONTACT, organization_id: ORG, name: "Joana Teste", observacoes: OBS, created_at: "2026-09-15T00:00:00Z" },
      { id: OTHER_CONTACT, organization_id: OTHER_ORG, name: "Outra", observacoes: "alheia", created_at: "2026-09-15T00:00:00Z" },
    ],
  };
  mock.admin.mockReturnValue({ from: (table: string) => new ReadQuery(table) });
});

describe("export LGPD — observações do contato", () => {
  it("pede a coluna e entrega o texto no snapshot do contato", async () => {
    const payload = await collectExportData(request);
    expect(reads.some((r) => r.table === "contacts" && /\bobservacoes\b/.test(r.columns))).toBe(true);
    expect(payload.contact?.observacoes).toBe(OBS);
    expect(JSON.stringify(payload)).not.toContain("alheia");
  });

  it("sem observação vem null, não some do payload", async () => {
    rows.contacts![0]!.observacoes = null;
    const payload = await collectExportData(request);
    expect(payload.contact).toHaveProperty("observacoes", null);
  });
});
