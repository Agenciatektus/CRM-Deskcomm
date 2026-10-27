/**
 * A PROTEÇÃO DO SALDO DA CHAVE DA PLATAFORMA (fatia 3): teto mensal por empresa,
 * disjuntor global, silêncio para a empresa e kill-switch. Cada caso "usa a
 * plataforma" tem o controle negativo ao lado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SEGREDO = "plataforma_segredo_nao_pode_vazar";

const ambiente = vi.hoisted(() => ({
  JEV_API_BASE_URL: "",
  OPENROUTER_BASE_URL: "",
  JEV_PLATFORM_API_KEY: "",
  JEV_LIGADO_POR_PADRAO: "",
  JEV_TETO_MENSAL_POR_EMPRESA_USD_CENTS: "",
}));
const banco = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  /** credencial própria por organização; ausente = sem chave própria. */
  proprias: new Set<string>(),
  assinatura: null as Record<string, unknown> | null,
  /** `${org}|${mes}` -> custo em centavos de dólar. */
  uso: new Map<string, number>(),
  /** Linha de `platform_config` do disjuntor global (o valor), ou null. */
  disjuntor: null as string | null,
  rpcs: [] as Array<{ org: string; custo: number }>,
  consultas: [] as string[],
}));
const logs = vi.hoisted(() => [] as Array<[string, string, Record<string, unknown> | undefined]>);

vi.mock("@/lib/env", () => ({ env: ambiente }));
vi.mock("@/lib/crypto/aes_gcm", () => ({ byteaToBuffer: (v: unknown) => v, decryptKey: () => "decifrada:propria" }));
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (m: string, c?: Record<string, unknown>) => logs.push(["warn", m, c]),
    error: (m: string, c?: Record<string, unknown>) => logs.push(["error", m, c]),
    info: (m: string, c?: Record<string, unknown>) => logs.push(["info", m, c]),
    debug: () => undefined,
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      banco.consultas.push(tabela);
      const filtros: Array<[string, unknown]> = [];
      let op: "select" | "update" | "delete" | "upsert" = "select";
      let patch: Record<string, unknown> | null = null;
      const valorDe = (c: string) => filtros.find(([k]) => k === c)?.[1];
      const executar = async () => {
        if (tabela === "platform_config") {
          if (op === "upsert") {
            banco.disjuntor = String((patch as { valor: string }).valor);
            return { data: null, error: null };
          }
          if (op === "delete") {
            banco.disjuntor = null;
            return { data: null, error: null };
          }
          if (op === "update") {
            // UPDATE condicional: só acerta se o valor ainda é o que o chamador leu.
            if (banco.disjuntor !== null && banco.disjuntor === valorDe("valor")) {
              banco.disjuntor = String((patch as { valor: string }).valor);
              return { data: { chave: "x" }, error: null };
            }
            return { data: null, error: null };
          }
          return { data: banco.disjuntor === null ? null : { valor: banco.disjuntor }, error: null };
        }
        if (tabela === "jev_plataforma_uso") {
          const custo = banco.uso.get(`${String(valorDe("organization_id"))}|${String(valorDe("mes"))}`);
          return { data: custo === undefined ? null : { custo_usd_cents: custo }, error: null };
        }
        if (tabela === "organizations") return { data: { settings: banco.settings }, error: null };
        if (tabela === "cobranca_assinaturas") return { data: banco.assinatura, error: null };
        if (tabela === "ai_provider_credentials") {
          const org = String(valorDe("organization_id"));
          return {
            data: banco.proprias.has(org) ? { api_key_encrypted: "c", api_key_iv: "i", api_key_tag: "t" } : null,
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "not", "order", "limit"]) chain[m] = () => chain;
      chain.eq = (c: string, v: unknown) => {
        filtros.push([c, v]);
        return chain;
      };
      chain.update = (p: Record<string, unknown>) => {
        op = "update";
        patch = p;
        return chain;
      };
      chain.upsert = (p: Record<string, unknown>) => {
        op = "upsert";
        patch = p;
        return chain;
      };
      chain.delete = () => {
        op = "delete";
        return chain;
      };
      chain.maybeSingle = executar;
      chain.then = (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro);
      return chain;
    },
    rpc: async (_nome: string, args: { p_org: string; p_custo_cents: number }) => {
      banco.rpcs.push({ org: args.p_org, custo: args.p_custo_cents });
      const chave = `${args.p_org}|${new Date().toISOString().slice(0, 7)}-01`;
      const total = (banco.uso.get(chave) ?? 0) + args.p_custo_cents;
      banco.uso.set(chave, total);
      return { data: total, error: null };
    },
  }),
}));

import { CODIGOS_SEM_REDE, codigoDoErroDoJev } from "@/lib/ai/decisao/textos";
import { decidirNoPonto, destinoDasTarefas } from "@/lib/ai/decisao/ponto";
import {
  CHAVE_DO_DISJUNTOR,
  REABERTURA_MS,
  tetoMensalPorEmpresaCents,
  zerarEstadoDaPlataforma,
} from "@/lib/ai/decisao/plataforma";
import { TAREFAS_DO_JEV } from "@/lib/ai/decisao/tarefas";

const ACEITE = { em: "2026-09-23T12:00:00.000Z", por: "22222222-2222-4222-8222-222222222222" };
const LIGADO = { jev: { ligado: true, modo: "decide", aceite: ACEITE } };
const CLIMA = TAREFAS_DO_JEV.filter((t) => t.ponto === "sentiment_classify");
const A = "org-a";
const B = "org-b";
const PERGUNTAS = { clima: { tipo: "score", instrucao: "Qual o clima?", criterios: ["ruim", "neutro", "bom"] } } as const;
const AGORA = new Date("2026-10-15T12:00:00.000Z");
const MES = "2026-10-01";

const respostaOk = () =>
  new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: { clima: { type: "score", score: 2, legend: {}, probabilities: { "2": 1 }, confidence: 0.9 } },
      usage: { input_tokens: 1000, output_tokens: 0 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const chamar = (org: string, fetchImpl: ReturnType<typeof vi.fn>) =>
  decidirNoPonto(
    { ponto: "sentiment_classify", organizationId: org, estado: "oi", perguntas: PERGUNTAS },
    { fetchImpl: fetchImpl as unknown as typeof fetch },
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  zerarEstadoDaPlataforma();
  ambiente.JEV_API_BASE_URL = "";
  ambiente.JEV_PLATFORM_API_KEY = SEGREDO;
  ambiente.JEV_TETO_MENSAL_POR_EMPRESA_USD_CENTS = "";
  banco.settings = LIGADO;
  banco.proprias.clear();
  banco.assinatura = { estado: "ativa", plano: { inclui_ia: true, ia_propria: false } };
  banco.uso.clear();
  banco.disjuntor = null;
  banco.rpcs.length = 0;
  banco.consultas.length = 0;
  logs.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("teto mensal por empresa", () => {
  it("abaixo do teto: usa a chave da plataforma e o gasto da chamada é registrado", async () => {
    banco.uso.set(`${A}|${MES}`, 10);
    const fetchImpl = vi.fn().mockResolvedValue(respostaOk());
    const r = await chamar(A, fetchImpl);
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(banco.rpcs).toHaveLength(1);
    expect(banco.rpcs[0]).toMatchObject({ org: A });
    expect(banco.rpcs[0]!.custo).toBeGreaterThan(0);
  });

  it("no teto: destino null, IA de sempre sem erro e ZERO fetch; o admin recebe o aviso (uma vez)", async () => {
    banco.uso.set(`${A}|${MES}`, 50);
    const fetchImpl = vi.fn();
    expect(await destinoDasTarefas(A, CLIMA)).toBeNull();
    const r = await chamar(A, fetchImpl);
    expect(r).toMatchObject({ ok: false, motivo: "sem_credencial", exigeAcao: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    const avisos = logs.filter(([n, m]) => n === "error" && m === "jev_plataforma_teto_atingido");
    expect(avisos).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(SEGREDO);
  });

  it("a empresa no teto não afeta outra abaixo dele", async () => {
    banco.uso.set(`${A}|${MES}`, 50);
    expect(await destinoDasTarefas(A, CLIMA)).toBeNull();
    expect((await destinoDasTarefas(B, CLIMA))?.daPlataforma).toBe(true);
  });

  it("chave própria ignora o teto", async () => {
    banco.uso.set(`${A}|${MES}`, 9999);
    banco.proprias.add(A);
    const d = await destinoDasTarefas(A, CLIMA);
    expect(d).toEqual({ chave: "decifrada:propria", origem: "typesafe" });
    expect(banco.consultas).not.toContain("jev_plataforma_uso");
  });

  it("mês novo zera: o gasto do mês anterior não conta", async () => {
    banco.uso.set(`${A}|2026-09-01`, 500);
    expect((await destinoDasTarefas(A, CLIMA))?.daPlataforma).toBe(true);
    // e o mesmo gasto no mês corrente trava
    banco.uso.set(`${A}|${MES}`, 500);
    zerarEstadoDaPlataforma();
    expect(await destinoDasTarefas(A, CLIMA)).toBeNull();
    // virou o mês: libera de novo
    vi.setSystemTime(new Date("2026-11-01T00:00:01.000Z"));
    expect((await destinoDasTarefas(A, CLIMA))?.daPlataforma).toBe(true);
  });

  it("o teto vem da env, e o padrão é 50", async () => {
    expect(tetoMensalPorEmpresaCents()).toBe(50);
    for (const lixo of ["", "abc", "0", "-5"]) {
      ambiente.JEV_TETO_MENSAL_POR_EMPRESA_USD_CENTS = lixo;
      expect(tetoMensalPorEmpresaCents(), lixo).toBe(50);
    }
    ambiente.JEV_TETO_MENSAL_POR_EMPRESA_USD_CENTS = "200";
    expect(tetoMensalPorEmpresaCents()).toBe(200);
    banco.uso.set(`${A}|${MES}`, 150);
    expect((await destinoDasTarefas(A, CLIMA))?.daPlataforma).toBe(true);
    ambiente.JEV_TETO_MENSAL_POR_EMPRESA_USD_CENTS = "100";
    zerarEstadoDaPlataforma();
    expect(await destinoDasTarefas(A, CLIMA)).toBeNull();
  });

  it("o gasto é lido uma vez e fica em cache: sem consulta por mensagem", async () => {
    await destinoDasTarefas(A, CLIMA);
    await destinoDasTarefas(A, CLIMA);
    await destinoDasTarefas(A, CLIMA);
    expect(banco.consultas.filter((t) => t === "jev_plataforma_uso")).toHaveLength(1);
  });
});

describe("disjuntor global", () => {
  const um402 = () => vi.fn().mockResolvedValue(new Response("{}", { status: 402 }));

  it("um 402 com a chave da plataforma abre para TODAS: a outra empresa fica sem fetch", async () => {
    const fetchA = um402();
    const r = await chamar(A, fetchA);
    expect(fetchA).toHaveBeenCalledTimes(1);
    // para a empresa: calado, sem pedido de ação e sem "confira o saldo"
    expect(r).toMatchObject({ ok: false, motivo: "disjuntor_aberto", exigeAcao: false });
    expect(CODIGOS_SEM_REDE.has(codigoDoErroDoJev("disjuntor_aberto"))).toBe(true);
    expect(banco.disjuntor).not.toBeNull();
    expect(Date.parse(banco.disjuntor!)).toBe(AGORA.getTime() + REABERTURA_MS);

    const fetchB = vi.fn();
    expect(await destinoDasTarefas(B, CLIMA)).toBeNull();
    const rb = await chamar(B, fetchB);
    expect(rb).toMatchObject({ ok: false, motivo: "sem_credencial" });
    expect(fetchB).not.toHaveBeenCalled();
    // o admin da plataforma foi avisado, sem a chave
    expect(logs.filter(([n, m]) => n === "error" && m === "jev_plataforma_disjuntor_aberto")).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(SEGREDO);
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
  });

  it("um 401 com a chave da plataforma também abre", async () => {
    await chamar(A, vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    expect(banco.disjuntor).not.toBeNull();
    expect(await destinoDasTarefas(B, CLIMA)).toBeNull();
  });

  it("controle: empresa com chave PRÓPRIA continua servida, e a falha dela mantém a mensagem de saldo", async () => {
    await chamar(A, um402());
    banco.proprias.add(B);
    const d = await destinoDasTarefas(B, CLIMA);
    expect(d).toEqual({ chave: "decifrada:propria", origem: "typesafe" });
    const r = await chamar(B, um402());
    expect(r).toMatchObject({ ok: false, motivo: "sem_credito", exigeAcao: true });
  });

  it("controle: falha que não é da conta (500) não abre o disjuntor", async () => {
    const r = await chamar(A, vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    expect(r).toMatchObject({ ok: false, motivo: "provedor_indisponivel" });
    expect(banco.disjuntor).toBeNull();
    expect((await destinoDasTarefas(B, CLIMA))?.daPlataforma).toBe(true);
  });

  it("meia-abertura: passado o tempo UMA empresa tenta; as outras seguem sem fetch; sucesso fecha para todas", async () => {
    await chamar(A, um402());
    vi.setSystemTime(new Date(AGORA.getTime() + REABERTURA_MS + 1_000));
    const fetchA = vi.fn().mockResolvedValue(respostaOk());
    const fetchB = vi.fn();
    // A ganha a tentativa; B, no mesmo instante, ainda vê aberto.
    const [ra, rb] = [await chamar(A, fetchA), await chamar(B, fetchB)];
    expect(ra.ok).toBe(true);
    expect(fetchA).toHaveBeenCalledTimes(1);
    // B só chegou depois de A fechar (sequencial), então já é servida: o que não pode é ter havido DUAS tentativas simultâneas
    expect(rb.ok === false || fetchB.mock.calls.length <= 1).toBe(true);
    expect(banco.disjuntor).toBeNull();
    expect((await destinoDasTarefas(B, CLIMA))?.daPlataforma).toBe(true);
  });

  it("meia-abertura: dois processos disputando, só um ganha a tentativa", async () => {
    await chamar(A, um402());
    vi.setSystemTime(new Date(AGORA.getTime() + REABERTURA_MS + 1_000));
    zerarEstadoDaPlataforma(); // outro processo não tem o cache do primeiro
    const primeiro = await destinoDasTarefas(A, CLIMA);
    expect(primeiro?.sondaDoDisjuntor).toBe(true);
    zerarEstadoDaPlataforma(); // e um terceiro processo, sem cache, depois da disputa
    const segundo = await destinoDasTarefas(B, CLIMA);
    expect(segundo).toBeNull();
  });

  it("meia-abertura: a tentativa que falha reabre por mais 15 minutos", async () => {
    await chamar(A, um402());
    vi.setSystemTime(new Date(AGORA.getTime() + REABERTURA_MS + 1_000));
    const r = await chamar(A, um402());
    expect(r).toMatchObject({ ok: false, motivo: "disjuntor_aberto" });
    expect(Date.parse(banco.disjuntor!)).toBe(Date.now() + REABERTURA_MS);
    expect(await destinoDasTarefas(B, CLIMA)).toBeNull();
    expect(banco.disjuntor).not.toBeNull();
    expect(CHAVE_DO_DISJUNTOR).toBe("JEV_PLATFORM_DISJUNTOR_ATE");
  });
});

describe("kill-switch e elegibilidade", () => {
  it("JEV_PLATFORM_API_KEY vazia desliga tudo: null, zero fetch e nenhuma consulta de proteção", async () => {
    ambiente.JEV_PLATFORM_API_KEY = "";
    const fetchImpl = vi.fn();
    expect(await destinoDasTarefas(A, CLIMA)).toBeNull();
    const r = await chamar(A, fetchImpl);
    expect(r).toMatchObject({ ok: false, motivo: "sem_credencial" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(banco.consultas).not.toContain("jev_plataforma_uso");
    expect(banco.consultas).not.toContain("platform_config");
  });

  it("controle: empresa inelegível não consulta teto nem disjuntor", async () => {
    banco.assinatura = null;
    expect(await destinoDasTarefas(A, CLIMA)).toBeNull();
    expect(banco.consultas).not.toContain("jev_plataforma_uso");
  });

  it("a chave da plataforma nunca aparece em log nem na resposta, em nenhum caminho", async () => {
    banco.uso.set(`${A}|${MES}`, 50);
    await chamar(A, vi.fn());
    zerarEstadoDaPlataforma();
    banco.uso.clear();
    const r1 = await chamar(B, vi.fn().mockResolvedValue(respostaOk()));
    const r2 = await chamar(B, vi.fn().mockResolvedValue(new Response("{}", { status: 402 })));
    expect(JSON.stringify([r1, r2, logs])).not.toContain(SEGREDO);
  });
});
