/**
 * O pareamento diz QUAL canal vincula — F4b do plano "Instagram como Canal".
 *
 * Sem isto, vincular seria tudo ou nada: ligar o WhatsApp ligaria o Instagram junto, e
 * desligar um desligaria o outro. O cliente que quer só o Direct no CRM, mantendo o
 * WhatsApp na Verdash, não teria como.
 *
 * O que estes testes fixam é o contrato do `saveVerdashSession`, e em especial duas
 * coisas que um refactor futuro pode desfazer sem perceber:
 *
 *   1. o DEFAULT continua sendo WhatsApp — todo chamador que existia antes de haver dois
 *      canais queria dizer "verdash", e o default é o que preserva cada um deles;
 *   2. o Instagram NÃO grava telefone, senão a sessão dele disputaria o unique
 *      (organization_id, phone_number) com a do WhatsApp da mesma organização.
 */

import { describe, expect, it } from "vitest";
import { CANAL_PAREAVEL_PADRAO, saveVerdashSession } from "./conectar";

/** A primeira linha gravada, com a falha explícita quando não houve nenhuma. */
function primeiraLinha(gravado: Record<string, unknown>[]): Record<string, unknown> {
  const linha = gravado[0];
  if (!linha) throw new Error("nada foi gravado");
  return linha;
}

/** Um `admin` de mentira que só guarda o que teria ido para o banco. */
function adminFalso() {
  const gravado: Record<string, unknown>[] = [];
  const admin = {
    from() {
      return {
        insert(linha: Record<string, unknown>) {
          gravado.push(linha);
          return Promise.resolve({ error: null });
        },
        update(linha: Record<string, unknown>) {
          gravado.push(linha);
          // `.eq(id).eq(organization_id)`: o update filtra a organização também.
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
      };
    },
  };
  return { admin, gravado };
}

const base = {
  organizationId: "org-1",
  existingId: null,
  instanceName: "tektus-dr-paulo",
  tokenEncrypted: "v1:x",
  webhookPathToken: "tok",
  webhookSecretEncrypted: "v1:y",
  phoneNumber: "5511999990000",
  displayName: "Dr. Paulo",
  connected: true,
};

describe("o pareamento diz qual canal vincula", () => {
  it("sem dizer o canal, continua sendo WhatsApp", async () => {
    const { admin, gravado } = adminFalso();
    await saveVerdashSession(admin as never, { ...base });

    expect(primeiraLinha(gravado).provider).toBe(CANAL_PAREAVEL_PADRAO);
    expect(primeiraLinha(gravado).provider).toBe("verdash");
  });

  it("pareando o Instagram, o provider é instagram", async () => {
    const { admin, gravado } = adminFalso();
    await saveVerdashSession(admin as never, { ...base, canal: "instagram" });

    expect(primeiraLinha(gravado).provider).toBe("instagram");
  });

  it("o Instagram não grava telefone — senão disputaria o unique com o WhatsApp", async () => {
    const { admin, gravado } = adminFalso();
    await saveVerdashSession(admin as never, {
      ...base,
      canal: "instagram",
      // Mesmo que quem chama mande um número, ele não vai para a linha do Instagram.
      phoneNumber: "5511999990000",
    });

    expect(primeiraLinha(gravado).phone_number).toBeNull();
  });

  it("o WhatsApp continua gravando o telefone", async () => {
    const { admin, gravado } = adminFalso();
    await saveVerdashSession(admin as never, { ...base, canal: "verdash" });

    expect(primeiraLinha(gravado).phone_number).toBe("5511999990000");
  });

  it("os dois canais podem ter vínculos DIFERENTES na mesma organização", async () => {
    const { admin, gravado } = adminFalso();

    await saveVerdashSession(admin as never, {
      ...base,
      canal: "verdash",
      vinculoId: "vinculo-do-whatsapp",
    });
    await saveVerdashSession(admin as never, {
      ...base,
      canal: "instagram",
      vinculoId: "vinculo-do-instagram",
    });

    // É esta a prova da fase: dois canais, dois vínculos, uma organização. Revogar um na
    // tela da Verdash não derruba o outro.
    expect(gravado.map((l) => [l.provider, l.verdash_vinculo_id])).toEqual([
      ["verdash", "vinculo-do-whatsapp"],
      ["instagram", "vinculo-do-instagram"],
    ]);
  });

  it("reconectar sempre tira o canal do arquivo", async () => {
    const { admin, gravado } = adminFalso();
    await saveVerdashSession(admin as never, { ...base, canal: "instagram" });
    // `archived_at: null` sempre — sem isso, reconectar por cima de um canal excluído o
    // deixaria invisível para o webhook, o envio e os seletores, todos filtrados por ela.
    expect(primeiraLinha(gravado).archived_at).toBeNull();
  });
});
