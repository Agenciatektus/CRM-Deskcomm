import { beforeEach, describe, expect, it, vi } from "vitest";

import { slugDoProvisionamento } from "@/lib/auth/provision";
import { argumentos, bancoFalso, operacao, valorDoFiltro, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

import type { CompraLida } from "./provedores/contrato";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./provedores", () => ({ adaptador: () => ({}), modoDoProvedor: async () => "teste" }));
vi.mock("./sincronizar", () => ({ sincronizar: vi.fn() }));

import { IDADE_MAXIMA_SEM_PAGAMENTO_MS, LIMITE_DE_COMPRAS_POR_RODADA, TETO_DE_TENTATIVAS, mascararEmail, processarCompra, processarComprasPendentes } from "./compra";

const AGORA = new Date("2026-10-27T12:00:00Z");

interface Mundo {
  compra: Record<string, unknown> | null;
  mapa: string | null;
  intervaloDoPlano: string | null;
  irmas: unknown[];
  erroDaSessao: string | null;
  erroDaRpc: { code: string; message: string } | null;
  fila: Array<{ id: string }>;
  filaDeEfeitos: Array<{ id: string }>;
}
let m: Mundo;
let banco: BancoFalso;
let n = 0;
let lida: CompraLida;
const lerCompra = vi.fn();
const sincronizar = vi.fn();
const aoCriar = vi.fn();
const aoDuplicar = vi.fn();
const avisarDono = vi.fn();
const auditar = vi.fn();

function responder(c: Cadeia): Resposta {
  if (c.tabela === "platform_config") return { data: m.mapa === null ? null : { valor: m.mapa } };
  if (c.tabela === "cobranca_planos") return { data: m.intervaloDoPlano === null ? null : { id: "x", intervalo: m.intervaloDoPlano } };
  if (c.tabela === "cobranca_compras") {
    const op = operacao(c);
    if (op === "update") {
      const campos = argumentos(c, "update")?.[0] as Record<string, unknown>;
      return "sessao_id" in campos && m.erroDaSessao ? { error: { code: m.erroDaSessao, message: "dup" } } : {};
    }
    if (String(argumentos(c, "or")?.[0] ?? "").includes("efeitos_pendentes")) return { data: m.filaDeEfeitos };
    if (valorDoFiltro(c, "eq", "email") !== undefined) return { data: m.irmas };
    if (valorDoFiltro(c, "eq", "id") !== undefined) return { data: m.compra };
    return { data: m.fila };
  }
  return {};
}
const rpc = (): Resposta => (m.erroDaRpc ? { error: m.erroDaRpc } : { data: `org-${n}` });
const gravacoes = () => banco.cadeias.filter((c) => c.tabela === "cobranca_compras" && operacao(c) === "update").map((c) => argumentos(c, "update")![0] as Record<string, unknown>);
const ultima = () => gravacoes().at(-1)!;
const rodar = (id = `compra-${n}`) =>
  processarCompra(banco.cliente as never, id, { adaptador: () => ({ lerCompra }) as never, modoDaChave: async () => "teste", sincronizar, agora: () => AGORA, aoCriar, aoDuplicar, avisarDono, audit: auditar });

beforeEach(() => {
  vi.clearAllMocks();
  aoCriar.mockReset();
  n += 1;
  m = {
    compra: { id: `compra-${n}`, evento_id: `evt_${n}`, status: "recebida", empresa_criada_id: null, tentativas: 0, email: null, nome_empresa: null, plano_chave: null, created_at: "2026-10-27T11:00:00Z" },
    mapa: JSON.stringify({ [`chave_${n}`]: `plano-${n}` }),
    intervaloDoPlano: "mes",
    irmas: [],
    erroDaSessao: null,
    erroDaRpc: null,
    fila: [],
    filaDeEfeitos: [],
  };
  lida = {
    sessaoId: `cs_test_${n}`,
    modo: "teste",
    modoDaSessao: "subscription",
    pagamento: "paid",
    status: "complete",
    clienteRef: `cus_${n}`,
    assinaturaRef: `sub_${n}`,
    intervaloDaAssinatura: "month",
    email: `Comprador${n}@Exemplo.com`,
    nome: "Fulana",
    planoChave: `chave_${n}`,
    nomeDaEmpresa: `Empresa ${n} Ltda`,
    clientReferenceId: `afiliado_${n}`,
  };
  lerCompra.mockImplementation(async () => lida);
  sincronizar.mockResolvedValue({ tipo: "aplicada", estado: "ativa", mudou: true, acao: "nada" });
  banco = bancoFalso(responder, rpc);
});

describe("processarCompra", () => {
  it("⭐ liga a compra à empresa: a RPC recebe exatamente o que a API devolveu e sincronizar roda com o org devolvido", async () => {
    const r = await rodar();
    expect(r).toEqual({ tipo: "criada", org: `org-${n}` });
    expect(lerCompra).toHaveBeenCalledWith(`evt_${n}`);
    expect(banco.rpcs).toEqual([
      {
        nome: "fn_cobranca_org_da_compra",
        args: {
          p_compra: `compra-${n}`,
          p_nome: `Empresa ${n} Ltda`,
          p_slug: slugDoProvisionamento("stripe", `cs_test_${n}`),
          p_plano: `plano-${n}`,
          p_modo: "teste",
          p_cliente: `cus_${n}`,
          p_assinatura: `sub_${n}`,
        },
      },
    ]);
    expect(sincronizar).toHaveBeenCalledTimes(1);
    expect(sincronizar.mock.calls[0]?.[1]).toBe(`org-${n}`);
    expect(gravacoes()[0]).toEqual({
      sessao_id: `cs_test_${n}`, modo: "teste", email: `comprador${n}@exemplo.com`, nome_empresa: `Empresa ${n} Ltda`, plano_chave: `chave_${n}`, client_reference_id: `afiliado_${n}`,
    });
    expect(ultima()).toMatchObject({ status: "criada", empresa_criada_id: `org-${n}` });
    expect(aoCriar).toHaveBeenCalledWith(`org-${n}`, expect.objectContaining({ id: `compra-${n}`, empresa_criada_id: `org-${n}` }));
  });

  it("client_reference_id fora do formato vira null; nome em branco e e-mail ausente recusam", async () => {
    lida = { ...lida, clientReferenceId: "tem espaço!" };
    await rodar();
    expect(gravacoes()[0]).toMatchObject({ client_reference_id: null });
  });

  it.each([
    ["modo_divergente", { modo: "producao" as const }],
    ["sessao_sem_assinatura", { modoDaSessao: "payment" }],
    ["sessao_sem_assinatura", { assinaturaRef: null }],
    ["plano_fora_do_mapa", { planoChave: "outra_chave" }],
    ["plano_fora_do_mapa", { planoChave: null }],
    ["intervalo_divergente", { intervaloDaAssinatura: "year" as const }],
    ["sem_nome_da_empresa", { nomeDaEmpresa: "   " }],
    ["sem_email", { email: null }],
    ["sessao_expirada", { pagamento: "unpaid", status: "expired" }],
  ])("recusa com %s sem chamar a RPC", async (motivo, mudanca) => {
    lida = { ...lida, ...mudanca };
    expect(await rodar()).toEqual({ tipo: "recusada", motivo });
    expect(ultima()).toEqual({ status: "recusada", motivo });
    expect(banco.rpcs).toEqual([]);
    expect(sincronizar).not.toHaveBeenCalled();
  });

  it("mapa ausente ou inválido: toda compra fica recusada com mapa_de_planos_ausente", async () => {
    for (const mapa of [null, "isto não é json", "[1,2]", "{}"]) {
      m.mapa = mapa;
      banco = bancoFalso(responder, rpc);
      expect(await rodar()).toEqual({ tipo: "recusada", motivo: "mapa_de_planos_ausente" });
      expect(banco.rpcs).toEqual([]);
    }
  });

  it("intervalo do plano 'ano' casa com assinatura 'year'", async () => {
    m.intervaloDoPlano = "ano";
    lida = { ...lida, intervaloDaAssinatura: "year" };
    expect((await rodar()).tipo).toBe("criada");
  });

  it("pagamento pendente: aguardando_pagamento, sem RPC", async () => {
    lida = { ...lida, pagamento: "unpaid", status: "open" };
    expect(await rodar()).toEqual({ tipo: "aguardando_pagamento" });
    expect(ultima()).toMatchObject({ status: "aguardando_pagamento" });
    expect(banco.rpcs).toEqual([]);
  });

  it("outro evento da mesma sessão (23505 no sessao_id): duplicada mesma_sessao e avisa o gancho", async () => {
    m.erroDaSessao = "23505";
    expect(await rodar()).toEqual({ tipo: "duplicada", motivo: "mesma_sessao" });
    expect(ultima()).toEqual({ status: "duplicada", motivo: "mesma_sessao" });
    expect(banco.rpcs).toEqual([]);
    expect(aoDuplicar).toHaveBeenCalledWith(expect.objectContaining({ id: `compra-${n}` }), "mesma_sessao");
  });

  it("mesmo e-mail com compra criada nas últimas 24h: duplicada mesmo_email, janela de 24h, sem RPC", async () => {
    m.irmas = [{ id: `outra-${n}` }];
    expect(await rodar()).toEqual({ tipo: "duplicada", motivo: "mesmo_email" });
    expect(banco.rpcs).toEqual([]);
    const consulta = banco.cadeias.find((c) => valorDoFiltro(c, "eq", "email") !== undefined)!;
    expect(valorDoFiltro(consulta, "eq", "email")).toBe(`comprador${n}@exemplo.com`);
    expect(valorDoFiltro(consulta, "eq", "status")).toBe("criada");
    expect(valorDoFiltro(consulta, "gte", "created_at")).toBe("2026-10-26T12:00:00.000Z");
    expect(aoDuplicar).toHaveBeenCalledWith(expect.anything(), "mesmo_email");
  });

  it("23505 da RPC (cus_ já ligado): duplicada cliente_ja_vinculado; 22023: recusada slug_em_uso", async () => {
    m.erroDaRpc = { code: "23505", message: "dup" };
    expect(await rodar()).toEqual({ tipo: "duplicada", motivo: "cliente_ja_vinculado" });
    expect(sincronizar).not.toHaveBeenCalled();
    m.erroDaRpc = { code: "22023", message: "slug" };
    expect(await rodar()).toEqual({ tipo: "recusada", motivo: "slug_em_uso" });
  });

  it("⭐ rede caída na releitura: falhou, tentativas + 1, sem RPC", async () => {
    m.compra = { ...m.compra, tentativas: 3 };
    lerCompra.mockRejectedValue(new Error("sem_resposta"));
    expect(await rodar()).toEqual({ tipo: "falhou" });
    expect(ultima()).toMatchObject({ status: "falhou", tentativas: 4 });
    expect(banco.rpcs).toEqual([]);
  });

  it("sincronizar que falha depois da RPC: falhou com tentativas + 1 (a RPC é reentrante)", async () => {
    sincronizar.mockResolvedValue({ tipo: "falhou", erro: "provedor_fora", transitorio: true });
    expect(await rodar()).toEqual({ tipo: "falhou" });
    expect(ultima()).toMatchObject({ status: "falhou", tentativas: 1 });
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("⭐ segunda execução de compra já criada, recusada ou duplicada: nada é relido nem criado", async () => {
    for (const status of ["criada", "recusada", "duplicada"]) {
      m.compra = { ...m.compra, status, empresa_criada_id: status === "criada" ? `org-${n}` : null };
      expect(await rodar()).toEqual({ tipo: "ja_resolvida", status });
    }
    expect(banco.rpcs).toEqual([]);
    expect(lerCompra).not.toHaveBeenCalled();
    expect(gravacoes()).toEqual([]);
  });

  it("compra inexistente", async () => {
    m.compra = null;
    expect(await rodar()).toEqual({ tipo: "inexistente" });
  });

  it("falha do gancho aoCriar não desfaz a empresa criada", async () => {
    aoCriar.mockRejectedValue(new Error("convite fora"));
    expect(await rodar()).toEqual({ tipo: "criada", org: `org-${n}` });
    expect(ultima()).toEqual({ motivo: "efeitos_pendentes", tentativas: 1 });
  });

  it("aguardando_pagamento soma uma tentativa a cada releitura", async () => {
    m.compra = { ...m.compra, tentativas: 4 };
    lida = { ...lida, pagamento: "unpaid", status: "open" };
    expect(await rodar()).toEqual({ tipo: "aguardando_pagamento" });
    expect(ultima()).toEqual({ status: "aguardando_pagamento", motivo: null, tentativas: 5 });
  });

  it("no_payment_required recusa com sem_pagamento, sem RPC e sem aviso", async () => {
    lida = { ...lida, pagamento: "no_payment_required" };
    expect(await rodar()).toEqual({ tipo: "recusada", motivo: "sem_pagamento" });
    expect(banco.rpcs).toEqual([]);
    expect(avisarDono).not.toHaveBeenCalled();
  });

  it("não paga além de 72 h recusa pagamento_nao_confirmado; dentro do prazo segue aguardando", async () => {
    lida = { ...lida, pagamento: "unpaid", status: "open" };
    const velha = new Date(AGORA.getTime() - IDADE_MAXIMA_SEM_PAGAMENTO_MS - 1000).toISOString();
    m.compra = { ...m.compra, created_at: velha };
    expect(await rodar()).toEqual({ tipo: "recusada", motivo: "pagamento_nao_confirmado" });
    const dentro = new Date(AGORA.getTime() - IDADE_MAXIMA_SEM_PAGAMENTO_MS + 60_000).toISOString();
    m.compra = { ...m.compra, created_at: dentro };
    expect(await rodar()).toEqual({ tipo: "aguardando_pagamento" });
    expect(avisarDono).not.toHaveBeenCalled();
  });

  it("recusa de sessão PAGA avisa o dono com o motivo e o e-mail mascarado, nunca cru", async () => {
    lida = { ...lida, planoChave: "outra_chave" };
    expect(await rodar()).toEqual({ tipo: "recusada", motivo: "plano_fora_do_mapa" });
    expect(avisarDono).toHaveBeenCalledTimes(1);
    const o = avisarDono.mock.calls[0]![1] as { titulo: string; corpo: string; botao: unknown };
    expect(o.titulo).toBe("Compra paga não virou empresa");
    expect(o.corpo).toContain("plano_fora_do_mapa");
    expect(o.corpo).toContain(`compra-${n}`);
    expect(o.corpo).toContain(`c***@exemplo.com`);
    expect(o.corpo).not.toContain(`omprador${n}@`);
    expect(o.botao).toBeNull();
  });

  it("recusa de sessão NÃO paga não avisa o dono", async () => {
    lida = { ...lida, pagamento: "unpaid", status: "expired" };
    expect(await rodar()).toEqual({ tipo: "recusada", motivo: "sessao_expirada" });
    expect(avisarDono).not.toHaveBeenCalled();
  });

  it("falhou avisa só quando a tentativa chega ao teto", async () => {
    lerCompra.mockRejectedValue(new Error("sem_resposta"));
    m.compra = { ...m.compra, tentativas: TETO_DE_TENTATIVAS - 2 };
    await rodar();
    expect(avisarDono).not.toHaveBeenCalled();
    m.compra = { ...m.compra, tentativas: TETO_DE_TENTATIVAS - 1 };
    await rodar();
    expect(avisarDono).toHaveBeenCalledTimes(1);
    expect((avisarDono.mock.calls[0]![1] as { titulo: string }).titulo).toBe("Compra parada depois de várias tentativas");
  });

  it("audita uma vez a empresa criada (resourceId = org da RPC, sem usuário) e reprocessar não audita de novo", async () => {
    await rodar();
    expect(auditar).toHaveBeenCalledTimes(1);
    expect(auditar).toHaveBeenCalledWith({
      action: "cobranca.compra_criou_empresa",
      actorUserId: null,
      organizationId: `org-${n}`,
      bypassedRls: true,
      resourceType: "cobranca_compra",
      resourceId: `org-${n}`,
      metadata: { compra: `compra-${n}`, plano: `chave_${n}`, origem: "venda_direta" },
    });
    m.compra = { ...m.compra, status: "criada", empresa_criada_id: `org-${n}` };
    await rodar();
    expect(auditar).toHaveBeenCalledTimes(1);
  });

  it("o e-mail sai mascarado para log", () => {
    expect(mascararEmail("maria@exemplo.com")).toBe("m***@exemplo.com");
    expect(mascararEmail(null)).toBe("(sem e-mail)");
  });
});

describe("processarComprasPendentes", () => {
  it("lê só recebida, aguardando_pagamento e falhou, com tentativas abaixo do teto, por created_at, no máximo 20", async () => {
    m.fila = [{ id: `compra-${n}` }];
    const r = await processarComprasPendentes(banco.cliente as never, { adaptador: () => ({ lerCompra }) as never, modoDaChave: async () => "teste", sincronizar, agora: () => AGORA });
    const consulta = banco.cadeias.find((c) => c.passos.some((p) => p.metodo === "in"))!;
    expect(argumentos(consulta, "in")).toEqual(["status", ["recebida", "aguardando_pagamento", "falhou"]]);
    expect(argumentos(consulta, "lt")).toEqual(["tentativas", TETO_DE_TENTATIVAS]);
    expect(argumentos(consulta, "order")).toEqual(["created_at", { ascending: true }]);
    expect(argumentos(consulta, "limit")).toEqual([LIMITE_DE_COMPRAS_POR_RODADA]);
    expect(r).toEqual({ lidas: 1, criadas: 1, falhas: 0 });
  });

  it("retentativa: criada com efeitos_pendentes roda SÓ aoCriar (sem RPC, sem releitura) e limpa o motivo", async () => {
    m.filaDeEfeitos = [{ id: `compra-${n}` }];
    m.compra = { id: `compra-${n}`, evento_id: `evt_${n}`, status: "criada", empresa_criada_id: `org-${n}`, tentativas: 1, email: "a@exemplo.com", nome_empresa: "Empresa", plano_chave: "pro" };
    const r = await processarComprasPendentes(banco.cliente as never, { adaptador: () => ({ lerCompra }) as never, sincronizar, aoCriar });
    const fila = banco.cadeias.find((c) => c.tabela === "cobranca_compras" && String(argumentos(c, "or")?.[0] ?? "").includes("efeitos_pendentes"))!;
    expect(valorDoFiltro(fila, "eq", "status")).toBe("criada");
    const ou = String(argumentos(fila, "or")?.[0]);
    expect(ou).toMatch(/^motivo\.eq\.efeitos_pendentes,and\(motivo\.eq\.convite_em_curso,updated_at\.lt\.\d{4}-\d{2}-\d{2}T[\d:.]+Z\)$/);
    expect(argumentos(fila, "lt")).toEqual(["tentativas", TETO_DE_TENTATIVAS]);
    expect(aoCriar).toHaveBeenCalledTimes(1);
    expect(aoCriar).toHaveBeenCalledWith(`org-${n}`, expect.objectContaining({ id: `compra-${n}`, nome_empresa: "Empresa" }));
    expect(banco.rpcs).toEqual([]);
    expect(lerCompra).not.toHaveBeenCalled();
    expect(sincronizar).not.toHaveBeenCalled();
    expect(ultima()).toEqual({ motivo: null });
    expect(r).toEqual({ lidas: 1, criadas: 0, falhas: 0 });
  });

  it("repetirEfeitos lê a compra aceitando os DOIS motivos (pendente e convite em curso velho)", async () => {
    m.filaDeEfeitos = [{ id: `compra-${n}` }];
    m.compra = { id: `compra-${n}`, evento_id: `evt_${n}`, status: "criada", empresa_criada_id: `org-${n}`, tentativas: 1, email: "a@exemplo.com", nome_empresa: "Empresa", plano_chave: "pro" };
    await processarComprasPendentes(banco.cliente as never, { aoCriar });
    const leitura = banco.cadeias.find((c) => c.tabela === "cobranca_compras" && valorDoFiltro(c, "eq", "id") !== undefined && argumentos(c, "in") !== undefined)!;
    expect(argumentos(leitura, "in")).toEqual(["motivo", ["efeitos_pendentes", "convite_em_curso"]]);
  });

  it("retentativa que falha de novo: mantém o motivo, soma a tentativa e conta falha", async () => {
    m.filaDeEfeitos = [{ id: `compra-${n}` }];
    m.compra = { id: `compra-${n}`, evento_id: `evt_${n}`, status: "criada", empresa_criada_id: `org-${n}`, tentativas: 3, email: "a@exemplo.com", nome_empresa: "Empresa", plano_chave: "pro" };
    aoCriar.mockRejectedValue(new Error("convite fora"));
    const r = await processarComprasPendentes(banco.cliente as never, { aoCriar });
    expect(ultima()).toEqual({ motivo: "efeitos_pendentes", tentativas: 4 });
    expect(r.falhas).toBe(1);
  });
});
