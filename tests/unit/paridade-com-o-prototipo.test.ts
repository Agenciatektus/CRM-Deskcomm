/**
 * PARIDADE COM O PROTÓTIPO — o critério de pronto da etapa 2 do design system.
 *
 * Lê os valores DIRETO dos protótipos (`docs/design/inbox-v2/Main.dc.html`, o bloco
 * "VARIANTE VERDASH" do `MainVerdash.dc.html` e o quadro `DesignSystem.dc.html`) e compara
 * com o CRM: tokens do `app/globals.css`, fontes do `app/layout.tsx` e as classes dos
 * `components/ui`. Reprova listando CADA divergência.
 *
 * Tolerância só para a conversão oklch->hex (±1 por canal). Exceção só pela lista
 * `EXCECOES` abaixo, cada uma com motivo; exceção que deixou de ser usada também reprova
 * (senão a lista envelhece e esconde regressão).
 *
 * Controle negativo: `tests/unit/paridade-controle-negativo.test.ts` muda um valor do
 * protótipo em memória e prova que a comparação reprova.
 */
import { describe, expect, it } from "vitest";

import { CHECAGENS } from "./paridade/componentes";
import { divergenciasDeTokens } from "./paridade/tokens";
import { classesDoArquivo, decl } from "./paridade/leitor";

/** id da divergência -> motivo. Só entra o que o Peterson aceitou ou o que não cabe ao CRM. */
export const EXCECOES: Record<string, string> = {
  "cor:escuro:--accent-fg":
    "O quadro escuro põe #f8f8f8 sobre o accent sólido #2690B1 (3,5:1, reprova AA de texto). O CRM calcula a frente (preto, 5,2:1); onde o quadro pinta branco sobre azul, a tela usa o degradê (botão, chip ligado, contador), com branco.",
  "popover:padding":
    "O `.pop` do protótipo é um menu (padding 6). O Popover do CRM hospeda formulário nas telas (filtros, data, etiquetas) e mantém 16; o menu de verdade é o DropdownMenu, com padding 6. Exceção aceita pelo Peterson na PR B da etapa 2.",
  "mistura:escuro:accent-hover":
    "No escuro o hover do botão primário é o degradê com `brightness(1.1)` no protótipo; o filtro escurece/clareia o texto junto (P1 do Cassio na #145). O CRM troca só o fundo (`--pele-grad-hover`) e, fora do degradê, usa a parada 500 do primary Verdash.",
};

function semExcecao(divergencias: string[], usadas: Set<string>): string[] {
  return divergencias.filter((d) => {
    const id = d.split(" ")[0]!;
    if (id in EXCECOES) {
      usadas.add(id);
      return false;
    }
    return true;
  });
}

describe("paridade com o protótipo", () => {
  const usadas = new Set<string>();

  it("tokens: cores dos dois temas, estados, misturas da marca, raios, tipografia, fontes", () => {
    const resto = semExcecao(divergenciasDeTokens(), usadas);
    expect(resto, `divergências de token:\n${resto.join("\n")}`).toEqual([]);
  });

  it("componentes: as regras-chave do protótipo estão nas classes dos components/ui", () => {
    const divergencias: string[] = [];
    const cache = new Map<string, Set<string>>();
    for (const ch of CHECAGENS) {
      const classes = cache.get(ch.arquivo) ?? classesDoArquivo(ch.arquivo);
      cache.set(ch.arquivo, classes);
      const valor = decl(ch.fonte, ch.seletor, ch.prop);
      const esperadas = [ch.classes(valor)].flat();
      const faltam = esperadas.filter((e) => !classes.has(e));
      if (faltam.length > 0) {
        divergencias.push(
          `${ch.id} ${ch.seletor} { ${ch.prop}: ${valor} } -> falta ${faltam.join(", ")} em ${ch.arquivo}`,
        );
      }
    }
    const resto = semExcecao(divergencias, usadas);
    expect(resto, `divergências de componente:\n${resto.join("\n")}`).toEqual([]);
  });

  it("desabilitado é cinza, não 50% de opacidade (quadro DS, Botões)", () => {
    expect(classesDoArquivo("components/ui/button.tsx").has("disabled:opacity-50")).toBe(false);
  });

  it("toda exceção da lista ainda corresponde a uma divergência real", () => {
    const sobrando = Object.keys(EXCECOES).filter((id) => !usadas.has(id));
    expect(sobrando, "exceção sem divergência: tire da lista").toEqual([]);
  });
});
