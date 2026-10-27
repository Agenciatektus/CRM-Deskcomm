import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  credencial: null as Record<string, unknown> | null,
  rpc: { data: true as unknown, error: null as { message: string } | null },
}));

vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: ({ ciphertext }: { ciphertext: unknown }) => ciphertext,
}));
vi.mock("@/lib/supabase/admin", () => {
  const query: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "limit"]) query[m] = () => query;
  query.maybeSingle = async () => ({ data: state.credencial, error: null });
  return {
    createAdminClient: () => ({
      from: () => query,
      rpc: async () => ({ data: state.rpc.data, error: state.rpc.error }),
    }),
  };
});

import { resolverChaveDaVozComMotivo, resolverChaveOpenAiDaVoz } from "@/lib/ai/agents";
import {
  erroDeVozSemChave,
  IaPropriaSemCredencialError,
  invalidarMemoIaPropria,
  MENSAGEM_SEM_CHAVE_OPENAI_NA_INSTALACAO,
} from "@/lib/cobranca/ia-propria";

beforeEach(() => {
  invalidarMemoIaPropria();
  state.credencial = null;
  state.rpc = { data: true, error: null };
  process.env.OPENAI_API_KEY = "chave-ficticia-env";
});

describe("resolverChaveOpenAiDaVoz", () => {
  it("controle negativo: plano com IA propria + env presente + sem credencial -> vazio", async () => {
    state.rpc.data = false;
    expect(await resolverChaveOpenAiDaVoz("org-1")).toBe("");
  });
  it("rpc com erro nega (fail-closed)", async () => {
    state.rpc.error = { message: "caiu" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resolverChaveOpenAiDaVoz("org-1")).toBe("");
    log.mockRestore();
  });
  it("sem plano (rpc true) usa o env como hoje", async () => {
    expect(await resolverChaveOpenAiDaVoz("org-1")).toBe("chave-ficticia-env");
  });
  it("credencial da org vence, mesmo em plano com IA propria", async () => {
    state.rpc.data = false;
    state.credencial = { api_key_encrypted: "chave-da-org", api_key_iv: "iv", api_key_tag: "tag" };
    expect(await resolverChaveOpenAiDaVoz("org-1")).toBe("chave-da-org");
  });
});

describe("motivo de a voz ficar sem chave", () => {
  it("plano com IA propria sem credencial -> motivo ia_propria e erro de IA propria", async () => {
    state.rpc.data = false;
    const r = await resolverChaveDaVozComMotivo("org-1");
    expect(r).toEqual({ chave: "", motivoSemChave: "ia_propria" });
    expect(erroDeVozSemChave(r.motivoSemChave)).toBeInstanceOf(IaPropriaSemCredencialError);
  });
  it("sem plano e sem OPENAI_API_KEY -> motivo instalacao e mensagem da chave da instalacao", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await resolverChaveDaVozComMotivo("org-1");
    expect(r).toEqual({ chave: "", motivoSemChave: "instalacao" });
    const erro = erroDeVozSemChave(r.motivoSemChave);
    expect(erro).not.toBeInstanceOf(IaPropriaSemCredencialError);
    expect(erro.message).toBe(MENSAGEM_SEM_CHAVE_OPENAI_NA_INSTALACAO);
  });
  it("com chave no env nao ha motivo", async () => {
    expect(await resolverChaveDaVozComMotivo("org-1")).toEqual({ chave: "chave-ficticia-env" });
  });
});
