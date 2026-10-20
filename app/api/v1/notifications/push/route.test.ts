/**
 * PUT /api/v1/notifications/push — a inscrição aceita só serviços de push
 * conhecidos; o resto é 422 pelo `fail()` canônico, sem gravar nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/vapid", () => ({ vapidPronto: () => true, vapidPublica: () => "pub" }));

const upsert = vi.fn(async () => ({ error: null }));

function pedido(endpoint: string) {
  return new NextRequest("http://localhost/api/v1/notifications/push", {
    method: "PUT",
    body: JSON.stringify({ endpoint, keys: { p256dh: "k", auth: "a" } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: "org-1", role: "agent" },
  } as never);
  vi.mocked(createClient).mockResolvedValue({ from: () => ({ upsert }) } as never);
});

describe("PUT da inscrição de push", () => {
  it("serviço conhecido é gravado", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(pedido("https://fcm.googleapis.com/fcm/send/abc"));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("serviço desconhecido é 422 e não grava", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(pedido("https://fcm.googleapis.com.evil.tld/fcm/send/abc"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(upsert).not.toHaveBeenCalled();
  });
});
