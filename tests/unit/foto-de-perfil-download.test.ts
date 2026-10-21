import { describe, expect, it, vi } from "vitest";

/**
 * O download da foto de perfil, cercado (P2-1 do @Cassio_SecRev na #240).
 *
 * O cron baixa de DENTRO da rede do servidor a URL que o canal devolveu. Sem
 * cerca, uma URL interna do FZAP, um redirecionamento para 169.254.169.254, um
 * SVG ou um corpo sem fim viram problema nosso. Cada teste abaixo é uma recusa,
 * e a cerca é uma só: `baixarFotoDePerfil` em `lib/channels/contact-avatar.ts`.
 */

import {
  TETO_DE_BYTES_DA_FOTO,
  baixarFotoDePerfil,
  hostDaFotoPermitido,
} from "@/lib/channels/contact-avatar";

const conferirDestino = async () => {};

function resposta(corpo: BodyInit | null, init: ResponseInit = {}) {
  return new Response(corpo, {
    status: 200,
    ...init,
    headers: { "content-type": "image/jpeg", ...(init.headers ?? {}) },
  });
}

describe("de onde a foto pode vir", () => {
  it.each([
    "https://pps.whatsapp.net/v/t61/foto.jpg",
    "https://scontent-gru1-1.cdninstagram.com/v/foto.jpg",
    "https://scontent.xx.fbcdn.net/v/foto.jpg",
    "https://fzap2.verdash.com.br/avatars/a.jpg",
  ])("aceita %s", (u) => {
    expect(hostDaFotoPermitido(new URL(u))).toBe(true);
  });

  it.each([
    "http://pps.whatsapp.net/foto.jpg", // sem TLS
    "https://pps.whatsapp.net:8443/foto.jpg", // porta fora do padrão
    "http://fzap:8080/avatars/a.jpg", // endereço interno do FZAP
    "https://169.254.169.254/latest/meta-data",
    "https://evil.example.com/foto.jpg",
    "https://whatsapp.net.evil.example.com/foto.jpg", // sufixo falso
    "https://supabase.verdash.com.br/foto.jpg", // outro host da Verdash
  ])("recusa %s", (u) => {
    expect(hostDaFotoPermitido(new URL(u))).toBe(false);
  });
});

describe("baixarFotoDePerfil", () => {
  it("baixa JPEG de host permitido", async () => {
    const fetchImpl = vi.fn(async () => resposta(new Uint8Array([1, 2, 3])));
    const r = await baixarFotoDePerfil("https://pps.whatsapp.net/foto.jpg", {
      fetchImpl,
      conferirDestino,
    });
    expect(r.mime).toBe("image/jpeg");
    expect(r.buffer.byteLength).toBe(3);
    // Redirecionamento sempre à mão.
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe(
      "manual",
    );
  });

  it("host fora da lista: recusa sem chegar à rede", async () => {
    const fetchImpl = vi.fn();
    await expect(
      baixarFotoDePerfil("https://evil.example.com/foto.jpg", { fetchImpl, conferirDestino }),
    ).rejects.toThrow(/host_not_allowed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("redirecionamento para host fora da lista: recusa e não segue", async () => {
    const fetchImpl = vi.fn(async (u: RequestInfo | URL) =>
      String(u).includes("pps.whatsapp.net")
        ? new Response(null, { status: 302, headers: { location: "http://fzap:8080/a.jpg" } })
        : resposta(new Uint8Array([1])),
    );
    await expect(
      baixarFotoDePerfil("https://pps.whatsapp.net/foto.jpg", { fetchImpl, conferirDestino }),
    ).rejects.toThrow(/host_not_allowed/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("redirecionamento entre hosts permitidos: segue", async () => {
    const fetchImpl = vi.fn(async (u: RequestInfo | URL) =>
      String(u).includes("lookaside")
        ? new Response(null, {
            status: 302,
            headers: { location: "https://scontent.xx.fbcdn.net/foto.jpg" },
          })
        : resposta(new Uint8Array([9])),
    );
    const r = await baixarFotoDePerfil("https://lookaside.fbcdn.net/foto", {
      fetchImpl,
      conferirDestino,
    });
    expect(r.buffer.byteLength).toBe(1);
  });

  it.each(["text/html", "image/svg+xml", ""])("content-type %j: recusa", async (tipo) => {
    const fetchImpl = vi.fn(async () =>
      resposta("<svg onload=alert(1)>", { headers: { "content-type": tipo } }),
    );
    await expect(
      baixarFotoDePerfil("https://pps.whatsapp.net/foto.jpg", { fetchImpl, conferirDestino }),
    ).rejects.toThrow(/mime_not_allowed/);
  });

  it("content-length acima do teto: recusa antes de ler", async () => {
    const fetchImpl = vi.fn(async () =>
      resposta(new Uint8Array([1]), {
        headers: { "content-length": String(TETO_DE_BYTES_DA_FOTO + 1) },
      }),
    );
    await expect(
      baixarFotoDePerfil("https://pps.whatsapp.net/foto.jpg", { fetchImpl, conferirDestino }),
    ).rejects.toThrow(/too_large/);
  });

  it("corpo sem content-length que passa do teto: recusa DURANTE a leitura", async () => {
    let enviados = 0;
    const pedaco = new Uint8Array(512 * 1024);
    const corpo = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        enviados++;
        if (enviados > 100) return ctrl.close(); // 50 MB se ninguém parar
        ctrl.enqueue(pedaco);
      },
    });
    const fetchImpl = vi.fn(async () => resposta(corpo));
    await expect(
      baixarFotoDePerfil("https://pps.whatsapp.net/foto.jpg", { fetchImpl, conferirDestino }),
    ).rejects.toThrow(/too_large/);
    // Parou logo depois de passar de 2 MB, não leu os 50.
    expect(enviados).toBeLessThan(10);
  });

  it("servidor que pendura: recusa pelo prazo", async () => {
    const fetchImpl = vi.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_ok, falha) => {
          init?.signal?.addEventListener("abort", () => falha(init.signal!.reason));
        }),
    );
    await expect(
      baixarFotoDePerfil("https://pps.whatsapp.net/foto.jpg", {
        fetchImpl,
        conferirDestino,
        timeoutMs: 30,
      }),
    ).rejects.toThrow(/timed out|timeout|abort/i);
  });
});
