// ─── A conversa mostra de que REDE ela veio ─────────────────────────────────
//
// `channelBrand` é o que decide o ícone no Inbox. Ele traduz PROVIDER (quem
// entrega) em REDE (o que o cliente usou), e o default é `"unknown"` — um ícone
// genérico de balão.
//
// POR QUE ISTO TEM TESTE
//
// Um provider que ninguém mapeia não quebra nada: ele cai no default e a
// conversa aparece com o balão cinza, como se não tivesse procedência. É uma
// falha que não levanta erro, não aparece em log e não some sozinha — alguém
// tem que reparar na tela e ligar os pontos. Dois canais estavam assim: o
// hospedado (WhatsApp de verdade, exibido como "canal") e o Instagram, que
// nasceu com ícone e cor prontos em `ChannelLogo` e nenhum caminho até eles.
//
// O caso do `zernio_social` continua aqui porque ele prova a regra inteira: o
// MESMO provider vira duas redes diferentes conforme a plataforma, e é por isso
// que a identidade não pode ser lida do provider direto.

import { describe, expect, it } from "vitest";

import { channelBrand } from "@/lib/channels/presentation";

describe("identidade de rede da conversa", () => {
  it("os canais de WhatsApp — inclusive o hospedado — mostram WhatsApp", () => {
    for (const provider of ["waha", "meta_cloud", "zernio", "wacalls", "verdash"]) {
      expect(channelBrand({ provider }), `${provider} devia ser whatsapp`).toBe("whatsapp");
    }
  });

  it("o canal de Instagram mostra Instagram", () => {
    expect(channelBrand({ provider: "instagram" })).toBe("instagram");
  });

  it("o mesmo provider social vira redes diferentes conforme a plataforma", () => {
    expect(channelBrand({ provider: "zernio_social", social_platform: "instagram" })).toBe(
      "instagram",
    );
    expect(channelBrand({ provider: "zernio_social", social_platform: "facebook" })).toBe(
      "messenger",
    );
    // Plataforma que o catálogo oferece mas o inbox não atende: melhor o balão
    // genérico que um ícone errado afirmando uma rede que não é aquela.
    expect(channelBrand({ provider: "zernio_social", social_platform: "linkedin" })).toBe(
      "unknown",
    );
  });

  it("o que não se conhece continua genérico, e não chuta", () => {
    expect(channelBrand({ provider: "canal_que_ainda_nao_existe" })).toBe("unknown");
    expect(channelBrand(null)).toBe("unknown");
    expect(channelBrand(undefined)).toBe("unknown");
    expect(channelBrand({})).toBe("unknown");
  });
});
