// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * AS FOTOS SEM DONO saem do bucket `fotos-de-perfil` — e só elas.
 *
 * Três órfãs (upload simultâneo, conta excluída, organização excluída) e três
 * que NÃO podem sair (a foto do ponteiro, o upload dentro da carência, o dono
 * cuja pergunta falhou). Cada regra tem o seu controle.
 */
const SEGREDO = "segredo-do-cron-fotos-orfas";
vi.mock("@/lib/env", () => ({ env: { INTERNAL_CRON_SECRET: SEGREDO, INTERNAL_SECRET: "" } }));
const auditou = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditou(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => bucket.client }));

const AGORA = new Date("2026-10-21T12:00:00Z");
const VELHO = "2026-10-20T12:00:00Z";
const NOVO = "2026-10-21T11:50:00Z"; // 10 min atrás: dentro da carência de 1 h

const U_VIVO = "11111111-1111-4111-8111-111111111111";
const U_EXCLUIDO = "22222222-2222-4222-8222-222222222222";
const U_DUVIDA = "33333333-3333-4333-8333-333333333333";
const O_VIVA = "44444444-4444-4444-8444-444444444444";
const O_EXCLUIDA = "55555555-5555-4555-8555-555555555555";
const f = (n: number, ext = "png") => `${String(n).repeat(8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa.${ext}`;

type Obj = { name: string; created_at: string };
const bucket = vi.hoisted(() => ({
  pastas: {} as Record<string, Array<{ name: string; created_at: string }>>,
  removidos: [] as string[],
  usuarios: {} as Record<string, { avatar_path: string | null } | "404" | "erro">,
  orgs: [] as Array<{ id: string; foto_path: string | null }>,
  escritasNoBanco: 0,
  client: null as unknown,
}));

function montarClient() {
  bucket.client = {
    storage: {
      from: () => ({
        list: async (prefixo: string, o: { limit: number; offset: number }) => {
          const raiz = prefixo === "usuarios" || prefixo === "organizacoes";
          if (raiz) {
            const donos = Object.keys(bucket.pastas)
              .filter((p) => p.startsWith(`${prefixo}/`))
              .map((p) => p.slice(prefixo.length + 1));
            return { data: donos.slice(o.offset, o.offset + o.limit).map((name) => ({ name, id: null })), error: null };
          }
          const arquivos = (bucket.pastas[prefixo] ?? []).filter((a) => !bucket.removidos.includes(`${prefixo}/${a.name}`));
          return { data: arquivos.slice(o.offset, o.offset + o.limit).map((a) => ({ ...a, id: "obj" })), error: null };
        },
        remove: async (caminhos: string[]) => {
          bucket.removidos.push(...caminhos);
          return { data: [], error: null };
        },
      }),
    },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = bucket.usuarios[id];
          if (u === "404" || u === undefined) return { data: { user: null }, error: { status: 404, message: "User not found" } };
          if (u === "erro") return { data: { user: null }, error: { status: 500, message: "boom" } };
          return { data: { user: { id, app_metadata: { avatar_path: u.avatar_path } } }, error: null };
        },
      },
    },
    from: (tabela: string) => {
      expect(tabela).toBe("organizations");
      const q = {
        select: () => q,
        in: async (_c: string, ids: string[]) => ({ data: bucket.orgs.filter((o) => ids.includes(o.id)), error: null }),
        update: () => {
          bucket.escritasNoBanco += 1;
          return q;
        },
        delete: () => {
          bucket.escritasNoBanco += 1;
          return q;
        },
      };
      return q;
    },
  };
}

function cenario() {
  const pastas: Record<string, Obj[]> = {
    // Pessoa viva: a do ponteiro fica; a perdedora de upload simultâneo sai; a recém-subida fica.
    [`usuarios/${U_VIVO}`]: [
      { name: f(1), created_at: VELHO },
      { name: f(2), created_at: VELHO },
      { name: f(3), created_at: NOVO },
    ],
    // Conta excluída: tudo que passou da carência sai.
    [`usuarios/${U_EXCLUIDO}`]: [{ name: f(4, "jpg"), created_at: VELHO }],
    // A pergunta sobre o dono falhou: nada sai.
    [`usuarios/${U_DUVIDA}`]: [{ name: f(5), created_at: VELHO }],
    // Organização viva: só a do ponteiro fica.
    [`organizacoes/${O_VIVA}`]: [
      { name: f(6), created_at: VELHO },
      { name: f(7, "webp"), created_at: VELHO },
    ],
    // Organização excluída (linha ausente).
    [`organizacoes/${O_EXCLUIDA}`]: [{ name: f(8), created_at: VELHO }],
  };
  bucket.pastas = pastas;
  bucket.usuarios = {
    [U_VIVO]: { avatar_path: `usuarios/${U_VIVO}/${f(1)}` },
    [U_EXCLUIDO]: "404",
    [U_DUVIDA]: "erro",
  };
  bucket.orgs = [{ id: O_VIVA, foto_path: `organizacoes/${O_VIVA}/${f(6)}` }];
}

beforeEach(() => {
  bucket.removidos = [];
  bucket.escritasNoBanco = 0;
  auditou.mockReset();
  montarClient();
  cenario();
});

describe("limparFotosOrfas", () => {
  it("⭐ tira as três órfãs e deixa ponteiro, carência e dúvida", async () => {
    const { limparFotosOrfas } = await import("./orfas");
    const r = await limparFotosOrfas(bucket.client as never, { agora: AGORA });
    expect(bucket.removidos.sort()).toEqual(
      [
        `usuarios/${U_VIVO}/${f(2)}`, // upload simultâneo que perdeu
        `usuarios/${U_EXCLUIDO}/${f(4, "jpg")}`, // conta excluída
        `organizacoes/${O_VIVA}/${f(7, "webp")}`, // perdedora na organização
        `organizacoes/${O_EXCLUIDA}/${f(8)}`, // organização excluída
      ].sort(),
    );
    // Controles: o ponteiro, o upload na carência e o dono em dúvida ficam.
    expect(bucket.removidos).not.toContain(`usuarios/${U_VIVO}/${f(1)}`);
    expect(bucket.removidos).not.toContain(`usuarios/${U_VIVO}/${f(3)}`);
    expect(bucket.removidos).not.toContain(`usuarios/${U_DUVIDA}/${f(5)}`);
    expect(bucket.removidos).not.toContain(`organizacoes/${O_VIVA}/${f(6)}`);
    expect(r).toMatchObject({ removidos: 4, duvidas: 1, truncado: false });
    // Só leitura no banco.
    expect(bucket.escritasNoBanco).toBe(0);
  });

  it("idempotente: a segunda rodada não acha nada", async () => {
    const { limparFotosOrfas } = await import("./orfas");
    await limparFotosOrfas(bucket.client as never, { agora: AGORA });
    const antes = bucket.removidos.length;
    const r2 = await limparFotosOrfas(bucket.client as never, { agora: AGORA });
    expect(r2.removidos).toBe(0);
    expect(bucket.removidos).toHaveLength(antes);
  });

  it("com teto: apaga até o limite, avisa que sobrou, e a próxima rodada continua", async () => {
    const { limparFotosOrfas } = await import("./orfas");
    const r = await limparFotosOrfas(bucket.client as never, { agora: AGORA, maxRemocoes: 1 });
    expect(r).toMatchObject({ removidos: 1, truncado: true });
    const r2 = await limparFotosOrfas(bucket.client as never, { agora: AGORA, maxRemocoes: 10 });
    expect(r2.removidos).toBe(3);
  });

  it("nome fora da forma de foto não é julgado por esta limpeza", async () => {
    bucket.pastas[`usuarios/${U_EXCLUIDO}`] = [{ name: "leia-me.txt", created_at: VELHO }];
    const { limparFotosOrfas } = await import("./orfas");
    await limparFotosOrfas(bucket.client as never, { agora: AGORA });
    expect(bucket.removidos).not.toContain(`usuarios/${U_EXCLUIDO}/leia-me.txt`);
  });
});

describe("GET /api/v1/cron/fotos-orfas", () => {
  // A rota usa o relógio real; sem fixar a data, o arquivo "recente" das
  // fixtures sai da carência de 1 h com o passar do dia e o teste muda de cor.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const pedido = (segredo?: string) =>
    new Request("http://localhost/api/v1/cron/fotos-orfas", {
      headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
    }) as unknown as NextRequest;

  it("sem o segredo do cron: 403 e nada sai do bucket", async () => {
    const { GET } = await import("@/app/api/v1/cron/fotos-orfas/route");
    const res = await GET(pedido("errado"));
    expect(res.status).toBe(403);
    expect(bucket.removidos).toHaveLength(0);
  });

  it("com o segredo: limpa e audita a rodada que apagou", async () => {
    const { GET } = await import("@/app/api/v1/cron/fotos-orfas/route");
    const res = await GET(pedido(SEGREDO));
    expect(res.status).toBe(200);
    expect(bucket.removidos).toHaveLength(4);
    expect(auditou).toHaveBeenCalledWith(
      expect.objectContaining({ action: "retention.sweep_run", metadata: expect.objectContaining({ origem: "fotos-orfas", removidos: 4 }) }),
    );
  });

  it("controle: rodada sem órfã não audita", async () => {
    bucket.pastas = {};
    const { GET } = await import("@/app/api/v1/cron/fotos-orfas/route");
    const res = await GET(pedido(SEGREDO));
    expect(res.status).toBe(200);
    expect(auditou).not.toHaveBeenCalled();
  });
});
