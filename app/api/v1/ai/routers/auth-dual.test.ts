import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({
  resolveAuthDual: vi.fn(),
  tetoDeEscritaDoToken: vi.fn(),
  support: vi.fn(),
}));

vi.mock("@/lib/api/auth-dual", () => ({
  resolveAuthDual: deps.resolveAuthDual,
  tetoDeEscritaDoToken: deps.tetoDeEscritaDoToken,
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));

import { GET as getRouters, POST as postRouter } from "./route";
import { DELETE as deleteRouter, GET as getRouter, PATCH as patchRouter } from "./[id]/route";
import { PUT as putMembers } from "./[id]/members/route";
import { POST as testRouter } from "./[id]/test/route";

const ROUTER_ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ROUTER_ID }) };

function req(path = "", method = "GET") {
  return new NextRequest(`http://localhost/api/v1/ai/routers${path}`, { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
});

describe("contrato de autorização dual das sete operações de routers", () => {
  it.each([
    {
      nome: "GET coleção",
      chamar: (request: NextRequest) => getRouters(request),
      path: "",
      method: "GET",
      role: "agent",
      scope: "mcp:read",
    },
    {
      nome: "GET detalhe",
      chamar: (request: NextRequest) => getRouter(request, ctx),
      path: `/${ROUTER_ID}`,
      method: "GET",
      role: "agent",
      scope: "mcp:read",
    },
    {
      nome: "POST coleção",
      chamar: (request: NextRequest) => postRouter(request),
      path: "",
      method: "POST",
      role: "admin",
      scope: "mcp:write",
    },
    {
      nome: "PATCH detalhe",
      chamar: (request: NextRequest) => patchRouter(request, ctx),
      path: `/${ROUTER_ID}`,
      method: "PATCH",
      role: "admin",
      scope: "mcp:write",
    },
    {
      nome: "DELETE detalhe",
      chamar: (request: NextRequest) => deleteRouter(request, ctx),
      path: `/${ROUTER_ID}`,
      method: "DELETE",
      role: "admin",
      scope: "mcp:write",
    },
    {
      nome: "PUT membros",
      chamar: (request: NextRequest) => putMembers(request, ctx),
      path: `/${ROUTER_ID}/members`,
      method: "PUT",
      role: "admin",
      scope: "mcp:write",
    },
    {
      nome: "POST teste",
      chamar: (request: NextRequest) => testRouter(request, ctx),
      path: `/${ROUTER_ID}/test`,
      method: "POST",
      role: "manager",
      scope: "mcp:write",
    },
  ])("$nome preserva o papel e exige $scope", async ({ chamar, path, method, role, scope }) => {
    deps.resolveAuthDual.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    const request = req(path, method);

    const response = await chamar(request);

    expect(response.status).toBe(401);
    expect(deps.resolveAuthDual).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ resource: "ai_routers", role, scope }),
    );
  });

  it.each([
    {
      nome: "POST coleção",
      chamar: (request: NextRequest) => postRouter(request),
      path: "",
      method: "POST",
      recurso: "ai_routers",
    },
    {
      nome: "PATCH detalhe",
      chamar: (request: NextRequest) => patchRouter(request, ctx),
      path: `/${ROUTER_ID}`,
      method: "PATCH",
      recurso: "ai_routers",
    },
    {
      nome: "DELETE detalhe",
      chamar: (request: NextRequest) => deleteRouter(request, ctx),
      path: `/${ROUTER_ID}`,
      method: "DELETE",
      recurso: "ai_routers",
    },
    {
      nome: "PUT membros",
      chamar: (request: NextRequest) => putMembers(request, ctx),
      path: `/${ROUTER_ID}/members`,
      method: "PUT",
      recurso: "ai_routers",
    },
    {
      nome: "POST teste",
      chamar: (request: NextRequest) => testRouter(request, ctx),
      path: `/${ROUTER_ID}/test`,
      method: "POST",
      recurso: "ai_routers_test",
    },
  ])("$nome aplica o teto do token antes do efeito", async ({ chamar, path, method, recurso }) => {
    const authz = {
      ok: true,
      organizationId: "22222222-2222-4222-8222-222222222222",
      actor: { type: "api_token", id: "tok-router" },
      supabase: {},
      via: "token",
      scopes: ["mcp:write"],
      apiTokenId: "tok-router",
    };
    deps.resolveAuthDual.mockResolvedValue(authz);
    deps.tetoDeEscritaDoToken.mockResolvedValue(new Response(null, { status: 429 }));
    const request = req(path, method);

    const response = await chamar(request);

    expect(response.status).toBe(429);
    expect(deps.tetoDeEscritaDoToken).toHaveBeenCalledWith(
      authz,
      recurso,
      expect.any(String),
    );
  });
});
