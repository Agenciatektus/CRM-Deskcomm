/**
 * A vitrine do design system mostra os componentes DE VERDADE.
 *
 * O valor da página `/app/design-system` é ser o espelho do que as telas
 * renderizam. Uma cópia local de botão, campo ou menu ficaria "certa" na
 * vitrine enquanto a tela real divergisse, e a página passaria a mentir sem
 * ninguém notar. Esta cerca exige que cada primitivo venha de `components/ui`
 * e que a vitrine não desenhe controle próprio com HTML cru.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = "app/app/design-system";

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return fontes(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

const ARQUIVOS = fontes(RAIZ);
const TUDO = ARQUIVOS.map((f) => readFileSync(f, "utf8")).join("\n");

/** Os primitivos que a vitrine tem de mostrar, um por módulo de components/ui. */
const OBRIGATORIOS = [
  "button",
  "input",
  "textarea",
  "select",
  "switch",
  "label",
  "badge",
  "chip",
  "tabs",
  "card",
  "skeleton",
  "table",
  "tooltip",
  "popover",
  "dropdown-menu",
  "dialog",
  "alert-dialog",
  "sheet",
];

describe("a vitrine usa os componentes de components/ui", () => {
  it("varreu arquivos (controle contra pasta vazia ou caminho errado)", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(5);
  });

  it.each(OBRIGATORIOS)("importa @/components/ui/%s", (modulo) => {
    expect(TUDO).toContain(`from "@/components/ui/${modulo}"`);
  });

  it("não desenha botão próprio: nenhum <button> cru", () => {
    const culpados = ARQUIVOS.filter((f) => /<button[\s>]/.test(readFileSync(f, "utf8")));
    expect(culpados).toEqual([]);
  });

  it("<input> cru só para caixa de seleção e opção (o padrão nativo do CRM)", () => {
    const culpados = ARQUIVOS.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<input\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => !/type="(checkbox|radio)"/.test(tag))
        .map((tag) => `${f}: ${tag}`),
    );
    expect(culpados).toEqual([]);
  });

  it("os componentes compartilhados da Inbox entram de verdade (pílulas, nota, bolha, avatar)", () => {
    for (const caminho of [
      "@/components/inbox/item/MetaDaConversa",
      "@/components/inbox/NoteCard",
      "@/components/inbox/bolha/estilo",
      "@/components/inbox/AvatarDoContato",
      "@/components/inbox/filtros/AbasDaInbox",
      "@/components/empty/EmptyState",
    ]) {
      expect(TUDO, caminho).toContain(`from "${caminho}"`);
    }
  });

  it("nenhuma cor hex solta: a vitrine só lê token", () => {
    const culpados = ARQUIVOS.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, "utf8").replace(/^\s*(\/\/|\*).*$/gm, "")));
    expect(culpados).toEqual([]);
  });
});
