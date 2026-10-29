import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/email/roteador";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { avisarMudancaDeAcesso } from "./avisar-mudanca-de-acesso";

vi.mock("@/lib/email/roteador", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const EMAIL = "pessoa.afetada@exemplo.com";
const args = {
  mudanca: { tipo: "acesso_removido" as const },
  autorId: "a",
  alvoId: "b",
  empresa: "Acme",
  orgId: "o",
  requestId: "r",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue({
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email: EMAIL, user_metadata: {} } }, error: null })) } },
  } as never);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true });
});

describe("avisarMudancaDeAcesso", () => {
  it("envia ao alvo", async () => {
    await avisarMudancaDeAcesso(args);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }));
  });

  it("não envia ao próprio autor", async () => {
    await avisarMudancaDeAcesso({ ...args, alvoId: "a" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("não envia quando o papel não mudou", async () => {
    await avisarMudancaDeAcesso({ ...args, mudanca: { tipo: "papel_alterado", papel: "agent", papelAnterior: "agent" } });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("engole falha e exceção do envio e não loga o e-mail em claro", async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, error: "rate_limited" });
    await expect(avisarMudancaDeAcesso(args)).resolves.toBeUndefined();
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("smtp caiu"));
    await expect(avisarMudancaDeAcesso(args)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(EMAIL);
  });
});
