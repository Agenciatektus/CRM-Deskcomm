import { describe, expect, it } from "vitest";

import type { ChannelSession } from "@/hooks/channels/useChannelSessions";

import {
  acoesDaConexao,
  calcularKpis,
  destinoDeGerenciar,
  detalheDaConexao,
  filtrarConexoes,
  montarConexoes,
  SEM_FILTROS,
  type ItemDeConexao,
} from "./conexoes-lista";

const sessao = (o: Partial<ChannelSession> & { id: string }): ChannelSession => ({
  provider: "waha",
  waha_session_name: "s",
  display_name: null,
  phone_number: null,
  status: "WORKING",
  status_reason: null,
  last_health_check_at: null,
  last_status_change_at: null,
  daily_message_limit: 100,
  is_warmup_complete: true,
  created_at: "2026-10-26T10:00:00Z",
  ...o,
});

const montar = (sessoes: ChannelSession[], origens: Record<string, string> = {}) =>
  montarConexoes({ sessoes, origens, voz: null, telefones: [] });

describe("montarConexoes", () => {
  it("deriva tipo e metodo do provider e marca a conexao criada por QR neste CRM", () => {
    const itens = montar(
      [
        sessao({ id: "a", provider: "waha" }),
        sessao({ id: "b", provider: "meta_cloud", waha_session_name: null }),
        sessao({ id: "c", provider: "verdash" }),
        sessao({ id: "d", provider: "verdash" }),
        sessao({ id: "e", provider: "instagram", waha_session_name: null }),
        sessao({ id: "f", provider: "zernio", waha_session_name: null }),
        sessao({ id: "g", provider: "zernio_social", waha_session_name: null }),
      ],
      { c: "nativa" },
    );
    const por = Object.fromEntries(itens.map((i) => [i.id, i]));
    expect(por.a).toMatchObject({ metodo: "qr", tipo: "whatsapp", viveNoTransporte: true });
    expect(por.b).toMatchObject({ metodo: "oficial", viveNoTransporte: false, temModelos: true });
    expect(por.c).toMatchObject({ metodo: "qr", nativa: true });
    expect(por.d).toMatchObject({ metodo: "verdash", nativa: false });
    expect(por.e).toMatchObject({ metodo: "instagram", tipo: "instagram" });
    expect(por.f).toMatchObject({ metodo: "parceiro" });
    expect(por.g).toBeUndefined(); // rede social saiu da pagina
  });

  it("inclui a ligacao (voz pareada e numeros de telefone) e ignora voz nao pareada", () => {
    const base = { sessoes: [], origens: {}, telefones: [{ id: "1", number: "+5511", label: null, is_active: false }] };
    const com = montarConexoes({ ...base, voz: { paired: true, status: null, jid: "x" } });
    expect(com.map((i) => [i.id, i.tipo, i.pausado])).toEqual([
      ["voz", "ligacao", false],
      ["telefone-1", "ligacao", true],
    ]);
    const sem = montarConexoes({ ...base, voz: { paired: false, status: null, jid: null } });
    expect(sem.map((i) => i.id)).toEqual(["telefone-1"]);
  });
});

describe("KPIs e filtros", () => {
  const itens = montar([
    sessao({ id: "1", display_name: "Comercial", phone_number: "+55 11 90000-0001" }),
    sessao({ id: "2", display_name: "Filial", status: "FAILED", phone_number: "+55 21 98888-0002" }),
    sessao({ id: "3", display_name: "Novo", status: "STARTING" }),
    sessao({ id: "4", display_name: "Campanhas", provider: "meta_cloud", waha_session_name: null, metadata: { disabled: true } }),
  ]);

  it("conta conectados, atencao (pausado nao conta) e total", () => {
    expect(calcularKpis(itens)).toEqual({ conectados: 1, atencao: 2, total: 4 });
  });

  it("filtra por nome, por digitos do numero, tipo, metodo e status", () => {
    const f = (p: Partial<typeof SEM_FILTROS>) => filtrarConexoes(itens, { ...SEM_FILTROS, ...p }).map((i) => i.id);
    expect(f({ busca: "comerc" })).toEqual(["1"]);
    expect(f({ busca: "98888" })).toEqual(["2"]);
    expect(f({ metodo: "oficial" })).toEqual(["4"]);
    expect(f({ status: "atencao" })).toEqual(["2", "3"]);
    expect(f({ status: "pausado" })).toEqual(["4"]);
    expect(f({ tipo: "instagram" })).toEqual([]);
    expect(f({})).toHaveLength(4);
  });
});

describe("acoes pelo status", () => {
  const item = (o: Partial<ItemDeConexao>): ItemDeConexao => ({
    ...montar([sessao({ id: "x" })])[0]!,
    ...o,
  });

  it("WORKING: abrir, renomear, pausar, grupos e excluir; sem continuar/reconectar", () => {
    const a = acoesDaConexao(item({}), true);
    expect(a).toEqual(expect.arrayContaining(["abrir", "renomear", "pausar", "grupos", "excluir"]));
    expect(a).not.toContain("continuar");
    expect(a).not.toContain("reconectar");
  });

  it("STARTING e SCAN_QR nativa: continuar + cancelar, nada de abrir/pausar", () => {
    for (const status of ["STARTING", "SCAN_QR_CODE"] as const) {
      expect(acoesDaConexao(item({ nativa: true, status }), false)).toEqual(["continuar", "cancelar"]);
    }
  });

  it("FAILED/STOPPED: reconectar + excluir; sem o servico no ar, so excluir", () => {
    expect(acoesDaConexao(item({ status: "FAILED" }), true)).toEqual(["reconectar", "pausar", "excluir"]);
    expect(acoesDaConexao(item({ status: "STOPPED", nativa: true }), false)).toEqual(["reconectar", "pausar", "excluir"]);
    expect(acoesDaConexao(item({ status: "FAILED" }), false)).toEqual(["pausar", "excluir"]);
  });

  it("canal sem sessao no transporte caido: gerenciar em vez de reconectar", () => {
    const oficial = item({ metodo: "oficial", viveNoTransporte: false, status: "FAILED" });
    expect(acoesDaConexao(oficial, true)).toEqual(["gerenciar", "pausar", "excluir"]);
  });

  it("estado desconhecido também pode ser pausado", () => {
    expect(acoesDaConexao(item({ status: null }), true)).toEqual(["pausar", "excluir"]);
  });

  it("WORKING com tela de apoio ganha Gerenciar no destino certo; QR (controle negativo) não", () => {
    const oficial = item({ metodo: "oficial", viveNoTransporte: false });
    expect(acoesDaConexao(oficial, true)).toContain("gerenciar");
    expect(destinoDeGerenciar(oficial)).toBe("/app/connections?aba=oficial");
    for (const metodo of ["parceiro", "instagram", "verdash"] as const) {
      expect(acoesDaConexao(item({ metodo }), true)).toContain("gerenciar");
    }
    expect(acoesDaConexao(item({ metodo: "qr" }), true)).not.toContain("gerenciar");
    const graph = item({ metodo: "parceiro", sessao: sessao({ id: "g", provider: "datafy" }) });
    expect(destinoDeGerenciar(graph)).toBe("/app/connections?aba=graph");
  });

  it("pausado: retomar + excluir; ligacao: so gerenciar", () => {
    expect(acoesDaConexao(item({ pausado: true }), true)).toEqual(["retomar", "excluir"]);
    expect(acoesDaConexao(item({ fonte: "voz" }), true)).toEqual(["gerenciar"]);
  });
});

describe("detalhe", () => {
  const agora = Date.parse("2026-10-26T10:10:00Z");
  const conectando = (desde: string) =>
    ({ ...montar([sessao({ id: "x" })])[0]!, status: "STARTING", mudouEm: desde }) as ItemDeConexao;

  it("conectando ha 1 min nao avisa; depois de 2 min diz que esta demorando", () => {
    expect(detalheDaConexao(conectando("2026-10-26T10:09:00Z"), agora)).toBe("Conectando há 1 min.");
    expect(detalheDaConexao(conectando("2026-10-26T10:04:00Z"), agora)).toBe("Conectando há 6 min. Está demorando.");
  });
});
