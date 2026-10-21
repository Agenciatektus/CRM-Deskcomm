import { describe, expect, it } from "vitest";

import {
  AI_ALLOWLIST_TTL_DAYS_DEFAULT,
  decidirElegibilidade,
  lerModoDoGate,
  montarEstadoDeElegibilidade,
  ttlDaAutorizacaoMs,
  type EstadoDeElegibilidade,
} from "./gate";

const AGORA = new Date("2026-08-27T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

const base: EstadoDeElegibilidade = {
  orgStatus: "active",
  canalDesativado: false,
  modo: "open",
  forceHuman: false,
  aiOptOut: false,
  botSilencedUntil: null,
  assigneeKind: "ai",
  aiAuthorizedAt: null,
  preGoLiveAtivo: false,
  numeroDeTesteAutorizado: false,
  agora: AGORA,
  ttlMs: 21 * DIA,
};

describe("lerModoDoGate", () => {
  it("só 'allowlist' liga o modo; resto (ausente/null/lixo) é 'open'", () => {
    expect(lerModoDoGate("allowlist")).toBe("allowlist");
    expect(lerModoDoGate("open")).toBe("open");
    expect(lerModoDoGate(undefined)).toBe("open");
    expect(lerModoDoGate(null)).toBe("open");
    expect(lerModoDoGate("ALLOWLIST")).toBe("open");
    expect(lerModoDoGate(42)).toBe("open");
  });
});

describe("decidirElegibilidade — gate 'open' (comportamento de hoje)", () => {
  it("mensagem genérica sem autorização: PERMITE (nada muda para quem não configurou)", () => {
    const d = decidirElegibilidade({ ...base, modo: "open" });
    expect(d.permite).toBe(true);
    expect(d.motivo).toBe("gate_aberto");
  });

  it("force_human bloqueia mesmo com gate aberto", () => {
    const d = decidirElegibilidade({ ...base, modo: "open", forceHuman: true });
    expect(d.permite).toBe(false);
    expect(d.motivo).toBe("force_human");
    expect(d.bloqueioPorAllowlist).toBe(false);
  });

  it("#2379: 'sempre atendimento humano' bloqueia sozinho — mesmo com force_human já limpo e autorização vigente", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      forceHuman: false,
      aiOptOut: true,
      aiAuthorizedAt: new Date(AGORA.getTime() - DIA),
    });
    expect(d.permite).toBe(false);
    expect(d.motivo).toBe("ai_opt_out");
    expect(d.bloqueioPorAllowlist).toBe(false);
  });

  it("#2379: montarEstadoDeElegibilidade só liga a marca com true literal", () => {
    const cru = {
      aiGate: "open",
      forceHuman: false,
      assigneeKind: null,
      botSilencedUntil: null,
      aiAuthorizedAt: null,
      orgStatus: "active",
      agora: AGORA,
      ttlMs: DIA,
    };
    expect(montarEstadoDeElegibilidade({ ...cru, aiOptOut: true }).aiOptOut).toBe(true);
    expect(montarEstadoDeElegibilidade({ ...cru, aiOptOut: null }).aiOptOut).toBe(false);
    expect(montarEstadoDeElegibilidade({ ...cru, aiOptOut: "true" }).aiOptOut).toBe(false);
  });

  it("conversa com dono humano bloqueia mesmo com gate aberto", () => {
    const d = decidirElegibilidade({ ...base, modo: "open", assigneeKind: "user" });
    expect(d.permite).toBe(false);
    expect(d.motivo).toBe("conversa_de_humano");
  });

  it("bot silenciado até o futuro bloqueia; silêncio no passado não", () => {
    expect(
      decidirElegibilidade({ ...base, modo: "open", botSilencedUntil: new Date(AGORA.getTime() + DIA) }).permite,
    ).toBe(false);
    expect(
      decidirElegibilidade({ ...base, modo: "open", botSilencedUntil: new Date(AGORA.getTime() - DIA) }).permite,
    ).toBe(true);
    expect(
      decidirElegibilidade({ ...base, modo: "open", botSilencedUntil: Number.POSITIVE_INFINITY }).permite,
    ).toBe(false);
  });
});

describe("decidirElegibilidade — gate 'allowlist' (deny by default)", () => {
  it("teste 1/3/4/9: mensagem comum de contato NÃO autorizado → NÃO responde", () => {
    const d = decidirElegibilidade({ ...base, modo: "allowlist", aiAuthorizedAt: null });
    expect(d.permite).toBe(false);
    expect(d.motivo).toBe("sem_autorizacao");
    expect(d.bloqueioPorAllowlist).toBe(true);
  });

  it("teste 6/7: contato autorizado dentro da janela → responde", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      aiAuthorizedAt: new Date(AGORA.getTime() - 3 * DIA),
    });
    expect(d.permite).toBe(true);
    expect(d.motivo).toBe("autorizado");
  });

  it("submissão antiga (fora da janela) NÃO reativa a IA", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      aiAuthorizedAt: new Date(AGORA.getTime() - 30 * DIA),
      ttlMs: 21 * DIA,
    });
    expect(d.permite).toBe(false);
    expect(d.motivo).toBe("autorizacao_expirada");
    expect(d.bloqueioPorAllowlist).toBe(true);
  });

  it("teste 10: conversa marcada human_only (force_human) → nunca responde, mesmo autorizada", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      forceHuman: true,
      aiAuthorizedAt: new Date(AGORA.getTime() - DIA),
    });
    expect(d.permite).toBe(false);
    expect(d.motivo).toBe("force_human");
  });

  it("teste 2: conversa aberta e autorizada → responde (estado da conversa não pesa)", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      assigneeKind: "ai",
      aiAuthorizedAt: new Date(AGORA.getTime() - DIA),
    });
    expect(d.permite).toBe(true);
  });
});

describe("decidirElegibilidade — pré-go-live", () => {
  it("permite o número escolhido mesmo sem autorização global", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      preGoLiveAtivo: true,
      numeroDeTesteAutorizado: true,
      aiAuthorizedAt: null,
    });
    expect(d).toEqual({
      permite: true,
      motivo: "numero_de_teste",
      bloqueioPorAllowlist: false,
    });
  });

  it("barra quem está fora da lista mesmo que uma campanha já tenha autorizado", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      preGoLiveAtivo: true,
      numeroDeTesteAutorizado: false,
      aiAuthorizedAt: AGORA,
    });
    expect(d).toEqual({
      permite: false,
      motivo: "fora_da_lista_de_teste",
      bloqueioPorAllowlist: true,
    });
  });

  it("vetos humanos continuam acima da lista de teste", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      preGoLiveAtivo: true,
      numeroDeTesteAutorizado: true,
      forceHuman: true,
    });
    expect(d.motivo).toBe("force_human");
  });
});

describe("ttlDaAutorizacaoMs", () => {
  it("default quando ausente/vazio/inválido/zero/negativo", () => {
    const esperado = AI_ALLOWLIST_TTL_DAYS_DEFAULT * DIA;
    expect(ttlDaAutorizacaoMs({})).toBe(esperado);
    expect(ttlDaAutorizacaoMs({ AI_ALLOWLIST_TTL_DAYS: "" })).toBe(esperado);
    expect(ttlDaAutorizacaoMs({ AI_ALLOWLIST_TTL_DAYS: "abc" })).toBe(esperado);
    expect(ttlDaAutorizacaoMs({ AI_ALLOWLIST_TTL_DAYS: "0" })).toBe(esperado);
    expect(ttlDaAutorizacaoMs({ AI_ALLOWLIST_TTL_DAYS: "-5" })).toBe(esperado);
  });
  it("respeita o valor configurado", () => {
    expect(ttlDaAutorizacaoMs({ AI_ALLOWLIST_TTL_DAYS: "7" })).toBe(7 * DIA);
  });
});

describe("decidirElegibilidade — organização não operante vence tudo", () => {
  it.each(["suspended", "redacted", "archived", "status_que_ainda_nao_existe", null])(
    "orgStatus %s → nega com org_nao_operante, antes de force_human, silêncio, dono humano e allowlist",
    (orgStatus) => {
      const d = decidirElegibilidade({
        ...base,
        orgStatus,
        modo: "allowlist",
        forceHuman: true,
        botSilencedUntil: new Date(AGORA.getTime() + DIA),
        assigneeKind: "user",
        aiAuthorizedAt: AGORA,
      });
      expect(d).toEqual({ permite: false, motivo: "org_nao_operante", bloqueioPorAllowlist: false });
    },
  );

  it("org active não muda nada (controle): gate aberto segue permitindo", () => {
    expect(decidirElegibilidade({ ...base, orgStatus: "active" }).motivo).toBe("gate_aberto");
  });
});

describe("decidirElegibilidade — canal desativado vence tudo (menos org parada)", () => {
  it("canalDesativado nega com canal_desativado mesmo com gate aberto e sem nenhuma outra trava", () => {
    const d = decidirElegibilidade({ ...base, modo: "open", canalDesativado: true });
    expect(d).toEqual({ permite: false, motivo: "canal_desativado", bloqueioPorAllowlist: false });
  });

  it("canalDesativado vence force_human, silêncio, dono humano e allowlist", () => {
    const d = decidirElegibilidade({
      ...base,
      modo: "allowlist",
      canalDesativado: true,
      forceHuman: true,
      botSilencedUntil: new Date(AGORA.getTime() + DIA),
      assigneeKind: "user",
      aiAuthorizedAt: AGORA,
    });
    expect(d.motivo).toBe("canal_desativado");
  });

  it("org parada vence o canal (ordem declarada): org_nao_operante primeiro", () => {
    const d = decidirElegibilidade({ ...base, orgStatus: "suspended", canalDesativado: true });
    expect(d.motivo).toBe("org_nao_operante");
  });
});

describe("montarEstadoDeElegibilidade — a org viaja", () => {
  it("orgStatus ausente vira null, e null é não operante (falha fechada)", () => {
    const e = montarEstadoDeElegibilidade({
      aiGate: null,
      forceHuman: false,
      aiOptOut: false,
      assigneeKind: null,
      botSilencedUntil: null,
      aiAuthorizedAt: null,
      orgStatus: undefined,
      agora: AGORA,
      ttlMs: DIA,
    });
    expect(e.orgStatus).toBeNull();
    expect(decidirElegibilidade(e).motivo).toBe("org_nao_operante");
  });

  it("canalDesativado ausente vira false (banco anterior à chave segue ligando)", () => {
    const e = montarEstadoDeElegibilidade({
      aiGate: "open",
      forceHuman: false,
      aiOptOut: false,
      assigneeKind: null,
      botSilencedUntil: null,
      aiAuthorizedAt: null,
      orgStatus: "active",
      agora: AGORA,
      ttlMs: DIA,
    });
    expect(e.canalDesativado).toBe(false);
    expect(decidirElegibilidade(e).motivo).toBe("gate_aberto");
  });

  it("só o booleano true desliga; 'true' string e 1 não", () => {
    for (const cru of ["true", 1]) {
      const e = montarEstadoDeElegibilidade({
        aiGate: "open",
        forceHuman: false,
        aiOptOut: false,
        assigneeKind: null,
        botSilencedUntil: null,
        aiAuthorizedAt: null,
        orgStatus: "active",
        canalDesativado: cru,
        agora: AGORA,
        ttlMs: DIA,
      });
      expect(e.canalDesativado).toBe(false);
    }
    const ligado = montarEstadoDeElegibilidade({
      aiGate: "open",
      forceHuman: false,
      aiOptOut: false,
      assigneeKind: null,
      botSilencedUntil: null,
      aiAuthorizedAt: null,
      orgStatus: "active",
      canalDesativado: true,
      agora: AGORA,
      ttlMs: DIA,
    });
    expect(decidirElegibilidade(ligado).motivo).toBe("canal_desativado");
  });
});


describe("decidirElegibilidade — o AUXILIAR DE CRM (9060)", () => {
  /**
   * A conversa que motivou a mudança: 552 conversas da Fiorotto, todas com
   * atendente humano, e um agente sem nenhuma capacidade de conversa que nunca
   * executou. As travas de passagem humana protegem a FALA; quem não fala não
   * disputa o cliente com ninguém.
   */
  const comDonoHumano: EstadoDeElegibilidade = { ...base, assigneeKind: "user" };
  const silenciada: EstadoDeElegibilidade = {
    ...base,
    botSilencedUntil: new Date(AGORA.getTime() + 30 * 60 * 1000),
  };

  it("⭐ conversa já assumida por uma pessoa: o auxiliar de CRM PASSA", () => {
    const d = decidirElegibilidade({ ...comDonoHumano, agenteSomenteInterno: true });
    expect(d.permite).toBe(true);
  });

  it("⭐ conversa silenciada por atendimento humano: o auxiliar de CRM PASSA", () => {
    const d = decidirElegibilidade({ ...silenciada, agenteSomenteInterno: true });
    expect(d.permite).toBe(true);
  });

  it("CONTROLE — agente que fala continua barrado nas duas", () => {
    // Sem este par, `permite: true` fixo passaria nos dois casos acima e a
    // liberação valeria para todo agente — exatamente o que ela não pode ser.
    expect(decidirElegibilidade(comDonoHumano)).toMatchObject({
      permite: false,
      motivo: "conversa_de_humano",
    });
    expect(decidirElegibilidade(silenciada)).toMatchObject({
      permite: false,
      motivo: "conversa_silenciada",
    });
  });

  it("CONTROLE — a marca AUSENTE não libera nada (o default é recusar)", () => {
    // `agenteSomenteInterno` é opcional: transporte que ainda não lê a coluna
    // devolve `undefined`, e o gate precisa seguir exatamente como antes.
    expect(decidirElegibilidade({ ...comDonoHumano, agenteSomenteInterno: undefined })).toMatchObject({
      permite: false,
      motivo: "conversa_de_humano",
    });
  });

  it("⭐ CONTROLE — `force_human` barra até o auxiliar: é a trava dura, e não é sobre quem atende", () => {
    const d = decidirElegibilidade({
      ...base,
      forceHuman: true,
      agenteSomenteInterno: true,
    });
    expect(d).toMatchObject({ permite: false, motivo: "force_human" });
  });

  it("⭐ CONTROLE — quem pediu para não receber nada também barra o auxiliar", () => {
    const d = decidirElegibilidade({ ...base, aiOptOut: true, agenteSomenteInterno: true });
    expect(d).toMatchObject({ permite: false, motivo: "ai_opt_out" });
  });

  it("CONTROLE — canal desativado e organização não operante seguem acima de tudo", () => {
    expect(
      decidirElegibilidade({ ...base, canalDesativado: true, agenteSomenteInterno: true }),
    ).toMatchObject({ permite: false, motivo: "canal_desativado" });
    expect(
      decidirElegibilidade({ ...base, orgStatus: "suspended", agenteSomenteInterno: true }),
    ).toMatchObject({ permite: false, motivo: "org_nao_operante" });
  });

  it("o montador lê a marca crua e só `true` liga", () => {
    const monta = (v: unknown) =>
      montarEstadoDeElegibilidade({
        aiGate: "open",
        orgStatus: "active",
        forceHuman: false,
        aiOptOut: false,
        assigneeKind: "user",
        botSilencedUntil: null,
        aiAuthorizedAt: null,
        agora: AGORA,
        ttlMs: 21 * DIA,
        agenteSomenteInterno: v,
      }).agenteSomenteInterno;
    expect(monta(true)).toBe(true);
    // `bool_and` sobre conjunto vazio volta `null` do Postgres: sessão sem
    // agente publicado não pode virar liberação.
    expect(monta(null)).toBe(false);
    expect(monta(undefined)).toBe(false);
    expect(monta(false)).toBe(false);
    expect(monta("true")).toBe(false);
  });
});
