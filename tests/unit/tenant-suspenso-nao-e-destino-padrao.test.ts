/**
 * Organização suspensa não é para onde a pessoa cai ao entrar.
 *
 * ─── O INCIDENTE QUE ORIGINOU ISTO ──────────────────────────────────────────
 *
 * 21/09/2026: o dono da instalação não conseguia usar a própria conta. Ele tinha
 * quatro vínculos, todos `admin`, e o mais antigo era um tenant suspenso em
 * 15/09 com o motivo "tenant duplicata". A escolha da organização ativa era
 * `memberships[0]` — a mais antiga —, então ele entrava na suspensa toda vez, e
 * as três ativas estavam logo atrás na mesma lista, invisíveis.
 *
 * O que torna esse defeito caro é que ele não parece um defeito: a tela abre, o
 * login funciona, e o que falta é DADO. Quem investiga procura permissão, RLS e
 * sessão — nunca "a organização certa não foi escolhida".
 *
 * ─── O QUE CADA CASO PRENDE ─────────────────────────────────────────────────
 *
 * Um teste de componente não alcançaria isto: a escolha acontece no servidor,
 * antes de qualquer tela existir. Por isso os casos exercitam a função pura.
 */

import { describe, expect, it } from "vitest";

import { escolherMembroAtivoParaTeste as escolher } from "@/lib/auth/server";
import type { UserOrgMembership } from "@/lib/auth/types";

const org = (id: string, status: string | null): UserOrgMembership => ({
  organization_id: id,
  organization_name: `Org ${id}`,
  role: "admin",
  org_status: status,
});

describe("escolha da organização ativa", () => {
  it("pula a suspensa e entrega a primeira que está de pé", () => {
    // O caso exato do incidente: a suspensa vem primeiro na ordem de `accepted_at`.
    const escolhida = escolher(
      [org("suspensa", "suspended"), org("tektus", "active"), org("cliente", "active")],
      undefined,
    );
    expect(escolhida?.organization_id).toBe("tektus");
  });

  it("com cookie numa suspensa, entra nela: é o caminho até o hub /account-suspended", () => {
    // Subida 1.73: o upstream criou o hub da suspensão (0501), que diz QUAL empresa
    // parou e lista as outras para trocar. Ignorar o cookie deixaria o hub
    // inalcançável para quem tem outra empresa ativa — e é por ele que se paga.
    const escolhida = escolher(
      [org("suspensa", "suspended"), org("tektus", "active")],
      "suspensa",
    );
    expect(escolhida?.organization_id).toBe("suspensa");
  });

  it("respeita o cookie quando ele aponta para uma que está de pé", () => {
    // A correção não pode atropelar a troca de organização feita pela pessoa.
    const escolhida = escolher(
      [org("tektus", "active"), org("cliente", "active")],
      "cliente",
    );
    expect(escolhida?.organization_id).toBe("cliente");
  });

  it("com TODAS suspensas, entrega a primeira mesmo assim", () => {
    // De propósito: a pessoa precisa ENTRAR para ver a tela que diz que a conta
    // está suspensa. Devolver `null` a mandaria para "você não pertence a nenhuma
    // organização", que é mentira e manda investigar a coisa errada.
    const escolhida = escolher([org("a", "suspended"), org("b", "suspended")], undefined);
    expect(escolhida?.organization_id).toBe("a");
  });

  it("sem vínculo nenhum, devolve null", () => {
    expect(escolher([], undefined)).toBeNull();
    expect(escolher([], "qualquer")).toBeNull();
  });

  it("status ausente não conta como operante: a régua é a do upstream (`ehOperante`)", () => {
    // Desde a 0501 a coluna é obrigatória; `null` só vem de leitura que não trouxe
    // o campo, e a escolha não aposta nela quando há uma empresa ativa.
    const escolhida = escolher([org("sem-status", null), org("ativa", "active")], undefined);
    expect(escolhida?.organization_id).toBe("ativa");
  });
});
