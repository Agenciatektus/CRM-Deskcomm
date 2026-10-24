import { describe, expect, it } from "vitest";

import { temSessaoViva } from "../../site/lib/sessao";

const AGORA = Date.UTC(2026, 9, 24, 12, 0, 0);
const b64 = (o: unknown) => `base64-${Buffer.from(JSON.stringify(o)).toString("base64url")}`;

describe("LP: só redireciona quem tem sessão viva no cookie", () => {
  it("cookie com sessão ainda válida redireciona", () => {
    const c = [{ name: "sb-deskcomm-auth", value: b64({ expires_at: AGORA / 1000 + 600 }) }];
    expect(temSessaoViva(c, AGORA)).toBe(true);
  });

  it("cookie antigo (sessão vencida) NÃO redireciona: a LP aparece", () => {
    const c = [{ name: "sb-deskcomm-auth", value: b64({ expires_at: AGORA / 1000 - 60 }) }];
    expect(temSessaoViva(c, AGORA)).toBe(false);
  });

  it("junta o cookie em pedaços (.0, .1) na ordem numérica", () => {
    const v = b64({ expires_at: AGORA / 1000 + 600 });
    const meio = Math.floor(v.length / 2);
    const c = [
      { name: "sb-deskcomm-auth.1", value: v.slice(meio) },
      { name: "sb-deskcomm-auth.0", value: v.slice(0, meio) },
    ];
    expect(temSessaoViva(c, AGORA)).toBe(true);
  });

  it("sem cookie, lixo ou outro cookie: sem sessão", () => {
    expect(temSessaoViva([], AGORA)).toBe(false);
    expect(temSessaoViva([{ name: "sb-deskcomm-auth", value: "xyz" }], AGORA)).toBe(false);
    expect(temSessaoViva([{ name: "outro", value: b64({ expires_at: AGORA / 1000 + 600 }) }], AGORA)).toBe(false);
  });
});
