import { describe, expect, it } from "vitest";

import { mensagemSemDado } from "./mensagem-sem-dado";

const vazia = { body: null, media_url: null, media_storage_path: null, metadata: {}, revoked_at: null };

describe("mensagemSemDado", () => {
  it("vazio total (body nulo/branco, sem mídia, metadata {} ou nulo) → esconde", () => {
    expect(mensagemSemDado(vazia)).toBe(true);
    expect(mensagemSemDado({ ...vazia, body: "  " })).toBe(true);
    expect(mensagemSemDado({ ...vazia, metadata: null as never })).toBe(true);
  });

  it("texto → mostra", () => {
    expect(mensagemSemDado({ ...vazia, body: "oi" })).toBe(false);
  });

  it("tipo_nao_suportado → mostra", () => {
    expect(mensagemSemDado({ ...vazia, metadata: { tipo_nao_suportado: "pollCreationMessage" } })).toBe(false);
  });

  it("mídia → mostra", () => {
    expect(mensagemSemDado({ ...vazia, media_url: "https://x/a.jpg" })).toBe(false);
    expect(mensagemSemDado({ ...vazia, media_storage_path: "org/a.jpg" })).toBe(false);
  });

  it("localização, contato, reação e anexos → mostra", () => {
    expect(mensagemSemDado({ ...vazia, metadata: { location: { latitude: 1, longitude: 2 } } })).toBe(false);
    expect(mensagemSemDado({ ...vazia, metadata: { contact: { name: "Ana" } } })).toBe(false);
    expect(mensagemSemDado({ ...vazia, metadata: { reaction: "👍" } })).toBe(false);
    expect(mensagemSemDado({ ...vazia, metadata: { provider_attachments: [{}] } })).toBe(false);
  });

  it("apagada de verdade (revoked_at) → mostra", () => {
    expect(mensagemSemDado({ ...vazia, revoked_at: "2026-10-01T00:00:00Z" })).toBe(false);
  });
});
