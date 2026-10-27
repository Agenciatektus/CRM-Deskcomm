/**
 * O JEV DA PLATAFORMA (fatia 1) — a chave que a instalação paga, e para quem.
 *
 * Todo teste de "usa a plataforma" tem seu controle negativo ao lado: a regra
 * que decide quem NÃO recebe é a que protege a conta da instalação.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const SEGREDO = "plataforma_segredo_nao_pode_vazar";
const PROPRIA = "decifrada:propria";

const ambiente = vi.hoisted(() => ({
  JEV_API_BASE_URL: "",
  OPENROUTER_BASE_URL: "",
  JEV_PLATFORM_API_KEY: "",
  JEV_LIGADO_POR_PADRAO: "",
}));
const banco = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  credencial: null as Record<string, unknown> | null,
  assinatura: null as Record<string, unknown> | null,
  erroDaAssinatura: null as Error | null,
  provedores: [] as string[],
}));
const avisos = vi.hoisted(() => [] as Array<[string, Record<string, unknown>]>);

vi.mock("@/lib/env", () => ({ env: ambiente }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {};
      for (const metodo of ["select", "not", "order", "limit"]) chain[metodo] = () => chain;
      chain.eq = (coluna: string, valor: unknown) => {
        if (coluna === "provider") banco.provedores.push(String(valor));
        return chain;
      };
      chain.maybeSingle = async () => {
        if (tabela === "organizations") {
          return { data: banco.settings === null ? null : { settings: banco.settings }, error: null };
        }
        if (tabela === "cobranca_assinaturas") return { data: banco.assinatura, error: banco.erroDaAssinatura };
        return { data: banco.credencial, error: null };
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: () => PROPRIA,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (msg: string, ctx: Record<string, unknown>) => avisos.push([msg, ctx]),
    info: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

import { configLigadaPorPadrao, ehConfigDoPadrao } from "@/lib/ai/decisao/config";
import { fonteDaChaveDoJev } from "@/lib/ai/decisao/credencial";
import { configEfetivaDoJev, organizacaoElegivelAoJev, plataformaTemJev } from "@/lib/ai/decisao/elegibilidade";
import { decidirNoPonto, destinoDasTarefas } from "@/lib/ai/decisao/ponto";
import { estadoEfetivoDaTarefa, TAREFA_DO_CLIMA, TAREFA_DO_ROTEADOR, TAREFAS_DO_JEV } from "@/lib/ai/decisao/tarefas";
import { createAdminClient } from "@/lib/supabase/admin";

const ACEITE = { em: "2026-09-23T12:00:00.000Z", por: "22222222-2222-4222-8222-222222222222" };
const LIGADO = { jev: { ligado: true, modo: "decide", aceite: ACEITE } };
const CLIMA = TAREFAS_DO_JEV.filter((t) => t.ponto === "sentiment_classify");
const CREDENCIAL = { api_key_encrypted: "c", api_key_iv: "i", api_key_tag: "t" };
const PLANO_COM_IA = { inclui_ia: true, ia_propria: false };

const assinatura = (estado: string, plano: Record<string, unknown> | null = PLANO_COM_IA) => ({ estado, plano });

beforeEach(() => {
  ambiente.JEV_API_BASE_URL = "";
  ambiente.JEV_PLATFORM_API_KEY = SEGREDO;
  ambiente.JEV_LIGADO_POR_PADRAO = "";
  banco.settings = LIGADO;
  banco.credencial = null;
  banco.assinatura = assinatura("ativa");
  banco.erroDaAssinatura = null;
  banco.provedores.length = 0;
  avisos.length = 0;
});

describe("resolução da chave: própria > plataforma > nenhuma", () => {
  it("a chave PRÓPRIA vence a da plataforma (e não é marcada daPlataforma)", async () => {
    banco.credencial = CREDENCIAL;
    const d = await destinoDasTarefas("org-1", CLIMA);
    expect(d).toEqual({ chave: PROPRIA, origem: "typesafe" });
    expect(d?.chave).not.toBe(SEGREDO);
  });

  it("elegível sem chave própria usa a da plataforma, marcada daPlataforma", async () => {
    expect(await destinoDasTarefas("org-1", CLIMA)).toEqual({ chave: SEGREDO, origem: "typesafe", daPlataforma: true });
  });

  it("apagar a chave própria cai na plataforma (mesma organização, antes e depois)", async () => {
    banco.credencial = CREDENCIAL;
    expect((await destinoDasTarefas("org-1", CLIMA))?.daPlataforma).toBeUndefined();
    banco.credencial = null;
    expect((await destinoDasTarefas("org-1", CLIMA))?.daPlataforma).toBe(true);
  });

  it("em teste e em atraso mantêm o Jev", async () => {
    for (const estado of ["trial", "em_atraso"]) {
      banco.assinatura = assinatura(estado);
      expect((await destinoDasTarefas("org-1", CLIMA))?.daPlataforma, estado).toBe(true);
    }
  });

  it.each([
    ["sem assinatura (isenta)", null],
    ["assinatura cancelada", assinatura("cancelada")],
    ["plano sem inclui_ia", assinatura("ativa", { inclui_ia: false, ia_propria: false })],
    ["plano com IA própria", assinatura("ativa", { inclui_ia: true, ia_propria: true })],
    ["plano sumido", assinatura("ativa", null)],
  ])("inelegível (%s) => null", async (_nome, linha) => {
    banco.assinatura = linha;
    expect(await destinoDasTarefas("org-1", CLIMA)).toBeNull();
  });

  it("JEV_PLATFORM_API_KEY vazia => null, mesmo elegível", async () => {
    ambiente.JEV_PLATFORM_API_KEY = "   ";
    expect(plataformaTemJev()).toBe(false);
    expect(await destinoDasTarefas("org-1", CLIMA)).toBeNull();
  });

  it("origem openrouter NUNCA usa a chave da plataforma", async () => {
    banco.settings = { jev: { ...LIGADO.jev, origem: "openrouter" } };
    expect(await destinoDasTarefas("org-1", CLIMA)).toBeNull();
    expect(banco.provedores).toEqual(["openrouter"]);
    // controle positivo: a mesma organização na origem typesafe recebe
    banco.settings = LIGADO;
    expect((await destinoDasTarefas("org-1", CLIMA))?.daPlataforma).toBe(true);
  });

  it("leitura da elegibilidade que falha => null, e o log leva só a classe do erro", async () => {
    banco.erroDaAssinatura = new Error(`falhou com ${SEGREDO}`);
    expect(await destinoDasTarefas("org-1", CLIMA)).toBeNull();
    expect(JSON.stringify(avisos)).not.toContain(SEGREDO);
    expect(JSON.stringify(avisos)).toContain("Error");
  });
});

describe("zero fetch sem consentimento ou elegibilidade", () => {
  const PERGUNTAS = {
    clima: { tipo: "score", instrucao: "Qual o clima?", criterios: ["ruim", "neutro", "bom"] },
  } as const;
  const chamar = (fetchImpl: typeof fetch) =>
    decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: "org-1", estado: "oi", perguntas: PERGUNTAS },
      { fetchImpl },
    );

  it("controle positivo: elegível e ligado => 1 fetch com a chave da plataforma; resposta e log não a levam", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: { clima: { type: "score", score: 2, legend: {}, probabilities: { "2": 1 }, confidence: 0.9 } },
          usage: { input_tokens: 1, output_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const r = await chamar(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(`Bearer ${SEGREDO}`);
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
    expect(JSON.stringify(avisos)).not.toContain(SEGREDO);
  });

  it.each([
    ["ligado=false", { jev: { ...LIGADO.jev, ligado: false } }],
    ["ligado sem aceite", { jev: { ligado: true, modo: "decide" } }],
    ["nada gravado (env do padrão desligada)", {}],
    ["tarefa do clima desligada", { jev: { ...LIGADO.jev, tarefas: { clima: { estado: "desligada" } } } }],
  ])("%s => sem_credencial e ZERO fetch, mesmo com a chave da plataforma", async (_nome, settings) => {
    banco.settings = settings;
    const fetchImpl = vi.fn();
    const r = await chamar(fetchImpl as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sem_credencial");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("organização sem assinatura => ZERO fetch", async () => {
    banco.assinatura = null;
    const fetchImpl = vi.fn();
    const r = await chamar(fetchImpl as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("JEV_LIGADO_POR_PADRAO", () => {
  const efetiva = (settings: unknown) =>
    configEfetivaDoJev(settings, () => organizacaoElegivelAoJev(createAdminClient(), "org-1"));

  it("env desligada: nada gravado continua desligado (controle negativo)", async () => {
    banco.settings = {};
    expect((await efetiva({})).ligado).toBe(false);
    expect(await destinoDasTarefas("org-1", CLIMA)).toBeNull();
  });

  it("env ligada + elegível + nada gravado: ligado, aceite do padrão, tarefas decidindo, roteador sob demanda", async () => {
    ambiente.JEV_LIGADO_POR_PADRAO = "true";
    const c = await efetiva({});
    expect(ehConfigDoPadrao(c)).toBe(true);
    expect(c).toMatchObject({ ligado: true, modo: "decide", modo_roteador: "sob_demanda", origem: "typesafe" });
    expect(estadoEfetivoDaTarefa(c, TAREFA_DO_CLIMA)).toBe("decidindo");
    expect(estadoEfetivoDaTarefa(c, TAREFA_DO_ROTEADOR)).toBe("decidindo");
    // sem cadastro de chave nenhum, o Jev já responde pela plataforma
    banco.settings = {};
    expect(await destinoDasTarefas("org-1", CLIMA)).toEqual({ chave: SEGREDO, origem: "typesafe", daPlataforma: true });
  });

  it("env ligada, mas inelegível => segue desligado e zero chave", async () => {
    ambiente.JEV_LIGADO_POR_PADRAO = "1";
    banco.assinatura = null;
    banco.settings = {};
    expect((await efetiva({})).ligado).toBe(false);
    expect(await destinoDasTarefas("org-1", CLIMA)).toBeNull();
  });

  it("env ligada sem JEV_PLATFORM_API_KEY => sem padrão", async () => {
    ambiente.JEV_LIGADO_POR_PADRAO = "true";
    ambiente.JEV_PLATFORM_API_KEY = "";
    expect((await efetiva({})).ligado).toBe(false);
  });

  it("gravado manda: a empresa que desligou continua desligada com a env ligada", async () => {
    ambiente.JEV_LIGADO_POR_PADRAO = "true";
    banco.settings = { jev: { ligado: false } };
    expect((await efetiva(banco.settings)).ligado).toBe(false);
    expect(await destinoDasTarefas("org-1", CLIMA)).toBeNull();
  });

  it("com algo gravado a elegibilidade nem é consultada; o aceite do padrão é de cada mensagem", async () => {
    ambiente.JEV_LIGADO_POR_PADRAO = "true";
    const elegivel = vi.fn().mockResolvedValue(true);
    await configEfetivaDoJev({ jev: { ligado: false } }, elegivel);
    expect(elegivel).not.toHaveBeenCalled();
    expect(configLigadaPorPadrao().aceite?.alcance).toBe("mensagem");
  });
});

describe("fonteDaChaveDoJev (as telas)", () => {
  const linha = {
    provider: "typesafe",
    is_active: true,
    validated_at: "2026-10-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
  };

  it("própria > plataforma > nenhuma", () => {
    expect(fonteDaChaveDoJev([linha], "typesafe", true)).toEqual({ tipo: "propria", credencial: linha });
    expect(fonteDaChaveDoJev([], "typesafe", true)).toEqual({ tipo: "plataforma" });
    expect(fonteDaChaveDoJev([], "typesafe", false)).toBeNull();
  });

  it("origem openrouter nunca cai na plataforma", () => {
    expect(fonteDaChaveDoJev([], "openrouter", true)).toBeNull();
  });

  it("chave própria ainda não validada não conta; a plataforma cobre", () => {
    expect(fonteDaChaveDoJev([{ ...linha, validated_at: null }], "typesafe", true)).toEqual({ tipo: "plataforma" });
  });
});

describe("migration 9076", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261027120000_9076_cobranca_planos_inclui_ia.sql"),
    "utf8",
  );
  const baseline = readFileSync(join(process.cwd(), "supabase/baseline.sql"), "utf8");

  it("inclui_ia nasce boolean not null default false, de forma idempotente", () => {
    expect(sql).toMatch(/add column if not exists inclui_ia boolean not null default false/);
  });

  it("marca só o plano mensal vivo de R$ 397 sem IA própria, e só uma vez", () => {
    const update = sql.match(/update public\.cobranca_planos[\s\S]*?;/)?.[0] ?? "";
    expect(update).toMatch(/set inclui_ia = true/);
    expect(update).toMatch(/preco_cents = 39700/);
    expect(update).toMatch(/intervalo = 'mes'/);
    expect(update).toMatch(/arquivado_em is null/);
    expect(update).toMatch(/ia_propria = false/);
    expect(update).toMatch(/inclui_ia = false/);
    expect(sql.match(/update public\.cobranca_planos/g)).toHaveLength(1);
  });

  it("o baseline leva o mesmo apêndice", () => {
    expect(baseline).toContain("add column if not exists inclui_ia boolean not null default false");
    expect(baseline).toContain("preco_cents = 39700");
  });
});
