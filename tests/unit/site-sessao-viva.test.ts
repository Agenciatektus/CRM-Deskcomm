import { describe, expect, it } from "vitest";

import { temSessaoViva } from "../../site/lib/sessao";

const AGORA = Date.UTC(2026, 9, 24, 12, 0, 0);
const b64 = (o: unknown) => `base64-${Buffer.from(JSON.stringify(o)).toString("base64url")}`;

describe("LP: só redireciona quem tem sessão viva no cookie", () => {
  it("cookie com sessão ainda válida redireciona", () => {
    const c = [{ name: "sb-deskcomm-auth", value: b64({ expires_at: AGORA / 1000 + 600 }) }];
    expect(temSessaoViva(c, AGORA)).toBe(true);
  });

  it("access token vencido há horas ainda redireciona: o CRM renova com o refresh token", () => {
    const c = [{ name: "sb-deskcomm-auth", value: b64({ expires_at: AGORA / 1000 - 3 * 3600, refresh_token: "x" }) }];
    expect(temSessaoViva(c, AGORA)).toBe(true);
  });

  it("cookie abandonado há mais de 7 dias NÃO redireciona: a LP aparece", () => {
    const c = [{ name: "sb-deskcomm-auth", value: b64({ expires_at: AGORA / 1000 - 8 * 86400 }) }];
    expect(temSessaoViva(c, AGORA)).toBe(false);
  });

  it("pedaços com buraco na sequência não são juntados", () => {
    const v = b64({ expires_at: AGORA / 1000 + 600 });
    const t = Math.floor(v.length / 3);
    const c = [
      { name: "sb-deskcomm-auth.0", value: v.slice(0, t) },
      { name: "sb-deskcomm-auth.2", value: v.slice(2 * t) },
    ];
    expect(temSessaoViva(c, AGORA)).toBe(false);
  });

  it("formato legado em JSON puro", () => {
    const c = [{ name: "sb-deskcomm-auth", value: JSON.stringify({ expires_at: AGORA / 1000 + 600 }) }];
    expect(temSessaoViva(c, AGORA)).toBe(true);
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
