import { describe, expect, it, vi } from "vitest";

import type * as ModuloDeEnv from "@/lib/env";
import {
  chaveRecusadaPeloProvedor,
  podeDescerDeDegrau,
  decidirTranscricao,
} from "@/lib/messaging/media/escada-de-transcricao";

// Instalação COM serviço de transcrição (a chave da Tektus).
vi.mock("@/lib/env", async (importOriginal) => {
  const real = await importOriginal<typeof ModuloDeEnv>();
  return {
    env: {
      ...real.env,
      TRANSCRIPTION_API_KEY: "chave-da-instalacao-de-controle",
      TRANSCRIPTION_MODEL: "",
      TRANSCRIPTION_BASE_URL: "",
      TRANSCRIPTION_LANGUAGES: "",
    },
  };
});

const GEMINI = { provider: "google", apiKey: "chave-google", modelId: "gemini-3.5-flash" } as const;
const openai = async () => "chave-openai";

describe("escada de transcrição: o que é da organização vem primeiro, o OpenRouter da Tektus por último (26/10)", () => {
  it("Gemini com credencial PRÓPRIA vence o serviço da instalação", async () => {
    const d = await decidirTranscricao({ conversa: { ...GEMINI, credencialPropria: true }, chaveOpenai: openai });
    expect(d.origem).toBe("modelo_da_organizacao");
  });

  it("org com chave OpenAI própria e modelo sem audio usa a OpenAI dela, não o serviço", async () => {
    const d = await decidirTranscricao({
      conversa: { provider: "anthropic", apiKey: "k", modelId: "claude-sonnet-5", credencialPropria: true },
      chaveOpenai: openai,
    });
    expect(d.origem).toBe("padrao_openai_compativel");
  });

  it("org sem nada que ouça (só assinatura ChatGPT) cai no serviço da instalação", async () => {
    const d = await decidirTranscricao({
      conversa: { provider: "openai", apiKey: "k", modelId: "gpt-5", credencialPropria: true },
      chaveOpenai: async () => null,
    });
    expect(d.origem).toBe("servico_da_instalacao");
    expect(await d.proxima!()).toBeNull();
  });

  it("chave da instalação no chat NÃO conta como própria: vai direto ao serviço", async () => {
    const d = await decidirTranscricao({
      conversa: { ...GEMINI, credencialPropria: false },
      chaveOpenai: async () => null,
    });
    expect(d.origem).toBe("servico_da_instalacao");
  });

  it("cascata A → B → C, uma vez por degrau, sem laço", async () => {
    const a = await decidirTranscricao({ conversa: { ...GEMINI, credencialPropria: true }, chaveOpenai: openai });
    expect(a.origem).toBe("modelo_da_organizacao");
    const b = await a.proxima!();
    expect(b?.origem).toBe("padrao_openai_compativel");
    const c = await b!.proxima!();
    expect(c?.origem).toBe("servico_da_instalacao");
    expect(await c!.proxima!()).toBeNull();
  });
});

describe("chaveRecusadaPeloProvedor", () => {
  it("reconhece 401/403 do SDK e do transcriber, e nada além", () => {
    expect(chaveRecusadaPeloProvedor(Object.assign(new Error("x"), { statusCode: 401 }))).toBe(true);
    expect(chaveRecusadaPeloProvedor(new Error("transcription_403"))).toBe(true);
    expect(chaveRecusadaPeloProvedor(new Error("transcription_500"))).toBe(false);
    expect(chaveRecusadaPeloProvedor(Object.assign(new Error("x"), { statusCode: 429 }))).toBe(false);
    expect(chaveRecusadaPeloProvedor(null)).toBe(false);
  });

  it("podeDescerDeDegrau também aceita 429, 5xx e tempo esgotado", () => {
    expect(podeDescerDeDegrau(Object.assign(new Error("x"), { statusCode: 429 }))).toBe(true);
    expect(podeDescerDeDegrau(Object.assign(new Error("x"), { statusCode: 503 }))).toBe(true);
    expect(podeDescerDeDegrau(new Error("transcription_502"))).toBe(true);
    expect(podeDescerDeDegrau(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe(true);
    expect(podeDescerDeDegrau(Object.assign(new Error("x"), { statusCode: 400 }))).toBe(false);
  });
});
