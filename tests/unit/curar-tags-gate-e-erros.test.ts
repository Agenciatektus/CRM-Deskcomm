/**
 * AS SERVER ACTIONS DE CURADORIA — o gate de papel e a tradução de recusa.
 *
 * Server Action é endpoint público: o tipo do parâmetro não chega ao servidor, e
 * o `organization_id` NUNCA pode vir de argumento. Os testes aqui medem as três
 * propriedades que mantêm isso verdadeiro:
 *
 *  1. o piso de papel de cada uma das cinco — e que o par manager/admin é o que
 *     está escrito, não o que a tela mostra;
 *  2. que a organização enviada à RPC é a de `resolveActiveOrg`, sempre;
 *  3. que cada recusa do banco vira um código que a tela sabe explicar — um
 *     `falha` genérico faria o operador tentar de novo para sempre contra uma
 *     etiqueta reservada.
 *
 * O gate de verdade está no corpo da função SQL (provado em psql). Estas actions
 * são a segunda tranca, e existem para não chamar a RPC à toa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const loadAuthUser = vi.fn();
const resolveActiveOrg = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: () => loadAuthUser(),
  resolveActiveOrg: () => resolveActiveOrg(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const ORG_DA_SESSAO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

import {
  apagarTag,
  arquivarTag,
  criarTag,
  mesclarTags,
  renomearTag,
} from "@/app/actions/settings/curarTags";

function sessaoComPapel(role: string) {
  loadAuthUser.mockResolvedValue({ id: "user-1", support: null, idioma: "pt-BR" });
  resolveActiveOrg.mockResolvedValue({ orgId: ORG_DA_SESSAO, name: "Org", role });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: { mudou: true, registros: 3 }, error: null });
});

describe("o piso de papel de cada ação", () => {
  it("manager cria e arquiva", async () => {
    sessaoComPapel("manager");
    expect((await criarTag("conversa", "orçamento")).ok).toBe(true);
    expect((await arquivarTag("conversa", "troca", true)).ok).toBe(true);
  });

  it("manager NÃO renomeia, não mescla e não apaga", async () => {
    // As três reescrevem `tags` em massa e nenhuma tem desfazer — a mesma régua
    // que faz `fn_definir_cliente_pela_agenda` ser admin.
    sessaoComPapel("manager");
    for (const r of [
      await renomearTag("conversa", "troca", "devolução"),
      await mesclarTags("conversa", ["urgentr"], "urgente"),
      await apagarTag("conversa", "troca"),
    ]) {
      expect(r).toEqual({ ok: false, erro: "sem_permissao" });
    }
    // E a RPC nem chegou a ser chamada.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("admin faz as cinco", async () => {
    sessaoComPapel("admin");
    expect((await renomearTag("conversa", "troca", "devolução")).ok).toBe(true);
    expect((await mesclarTags("conversa", ["urgentr"], "urgente")).ok).toBe(true);
    expect((await apagarTag("conversa", "troca")).ok).toBe(true);
  });

  it("agent não faz nenhuma", async () => {
    sessaoComPapel("agent");
    expect((await criarTag("conversa", "x")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem sessão, nada acontece", async () => {
    loadAuthUser.mockResolvedValue(null);
    expect(await criarTag("conversa", "x")).toEqual({ ok: false, erro: "sessao" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("a organização vem da sessão, nunca do argumento", () => {
  it("nenhuma das cinco aceita organização por parâmetro", async () => {
    sessaoComPapel("admin");
    await criarTag("conversa", "x");
    await renomearTag("conversa", "a", "b");
    await mesclarTags("conversa", ["a"], "b");
    await apagarTag("conversa", "a");
    await arquivarTag("conversa", "a", true);
    expect(rpc.mock.calls.length).toBe(5);
    for (const chamada of rpc.mock.calls) {
      expect((chamada[1] as { p_org: string }).p_org).toBe(ORG_DA_SESSAO);
    }
    // A assinatura em si já impede: nenhuma das cinco tem um parâmetro de org.
    expect(criarTag.length).toBe(2);
    expect(apagarTag.length).toBe(2);
    expect(renomearTag.length).toBe(3);
  });
});

describe("a entrada é validada no servidor", () => {
  it("escopo inventado é recusado antes de qualquer chamada", async () => {
    sessaoComPapel("admin");
    expect(await criarTag("crm_leads", "x")).toEqual({ ok: false, erro: "nome_invalido" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("nome vazio, longo demais ou de outro tipo é recusado", async () => {
    sessaoComPapel("admin");
    expect((await criarTag("conversa", "")).ok).toBe(false);
    expect((await criarTag("conversa", "x".repeat(41))).ok).toBe(false);
    expect((await criarTag("conversa", { tag: "x" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mesclar exige ao menos uma origem", async () => {
    sessaoComPapel("admin");
    expect((await mesclarTags("conversa", [], "urgente")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("normaliza como o Inbox: trim e minúsculas antes de chegar ao banco", async () => {
    // Sem isto a curadoria gravaria `Urgente` como canônica, e o editor do
    // Inbox (que compara em minúsculas) nunca casaria a sugestão com o que o
    // atendente digita: a etiqueta apareceria na lista e não funcionaria.
    sessaoComPapel("admin");
    await criarTag("conversa", "  URGENTE  ");
    expect((rpc.mock.calls[0]?.[1] as { p_tag: string }).p_tag).toBe("urgente");
  });
});

describe("cada recusa do banco vira um código que a tela sabe explicar", () => {
  const casos: Array<[string, string, string]> = [
    ["tags_etiqueta_do_sistema", "42501", "etiqueta_do_sistema"],
    ["tags_destino_ja_existe", "23505", "destino_ja_existe"],
    ["tags_mfa_required", "42501", "mfa"],
    ["tags_forbidden", "42501", "sem_permissao"],
    ["tags_limite", "23514", "limite"],
    ["tags_nome_invalido", "22023", "nome_invalido"],
    ["canceling statement due to statement timeout", "55P03", "tente_de_novo"],
    ["deadlock detected", "40P01", "tente_de_novo"],
  ];

  it.each(casos)("%s -> %s", async (message, code, esperado) => {
    sessaoComPapel("admin");
    rpc.mockResolvedValue({ data: null, error: { code, message } });
    const r = await apagarTag("contato", "cliente");
    expect(r).toEqual({ ok: false, erro: esperado });
  });

  it("um corpo que não é o contrato vira falha, não sucesso silencioso", async () => {
    sessaoComPapel("admin");
    rpc.mockResolvedValue({ data: { inesperado: true }, error: null });
    expect(await apagarTag("conversa", "troca")).toEqual({ ok: false, erro: "falha" });
  });
});

describe("o número que volta é o do banco", () => {
  it("a contagem de registros atravessa até a tela", async () => {
    // A tela mostra "Apagada de 312 conversas". Se a action devolvesse zero
    // fixo, o operador leria que nada aconteceu logo depois de destruir 312.
    sessaoComPapel("admin");
    rpc.mockResolvedValue({ data: { mudou: true, registros: 312 }, error: null });
    expect(await apagarTag("conversa", "troca")).toMatchObject({ ok: true, registros: 312 });
  });
});
