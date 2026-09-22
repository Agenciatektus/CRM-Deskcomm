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
  status,
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

  it("ignora o cookie quando ele aponta para uma suspensa", () => {
    // A suspensão acontece DEPOIS de o cookie ser gravado — que é a ordem normal
    // dos fatos. Sem isto, quem entrou uma vez fica preso por um cookie que não
    // sabe que existe.
    const escolhida = escolher(
      [org("suspensa", "suspended"), org("tektus", "active")],
      "suspensa",
    );
    expect(escolhida?.organization_id).toBe("tektus");
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

  it("status ausente conta como de pé", () => {
    // Instalação antiga, ou linha gravada antes de a coluna existir: a ausência
    // de status não pode barrar ninguém. Só `suspended` barra, e só ele.
    const escolhida = escolher([org("sem-status", null), org("ativa", "active")], undefined);
    expect(escolhida?.organization_id).toBe("sem-status");
  });
});
