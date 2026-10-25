import { afterEach, describe, expect, it, vi } from "vitest";

import { lerIdentidadeDoToken } from "@/lib/plataformas-de-anuncio/meta/oauth/token";

afterEach(() => vi.unstubAllGlobals());

describe("identidade: corte por code point", () => {
  it("emoji na borda dos 200 não é partido ao meio", async () => {
    const nome = "a".repeat(199) + "😀😀";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new Response(JSON.stringify(url.includes("businesses") ? { data: [] } : { id: "1", name: nome })),
      ),
    );
    const r = await lerIdentidadeDoToken("t");
    expect(r.nome).toBe("a".repeat(199) + "😀");
    expect(Array.from(r.nome!)).toHaveLength(200);
  });
});
