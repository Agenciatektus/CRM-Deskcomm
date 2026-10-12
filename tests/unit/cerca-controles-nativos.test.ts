/**
 * Regra 6 do quadro DS: "nada de controle nativo genérico". Data, hora e
 * seletores seguem o design system: `<Escolha>` (components/ui/escolha) no
 * lugar do `<select>`, e `<CampoDeData>` (components/ui/campo-de-data) no
 * lugar de `<input type="date|time|datetime-local">`.
 *
 * Esta cerca reprova controle nativo NOVO fora de `components/ui/` (onde
 * moram os componentes, que usam o `<select>`/`<input>` escondido para
 * formulário). Teste e fixture não entram: eles montam DOM de propósito.
 *
 * `EXCECOES` lista quem ainda não pôde trocar, com o motivo. Ela só encolhe:
 * arquivo listado que já não tem controle nativo também reprova, para a lista
 * não virar licença esquecida.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const PASTAS = ["app", "components", "hooks", "lib"];

const EXCECOES: Record<string, string> = {
  "app/design/components/Switcher.tsx":
    "laboratório de variantes (/design) com tokens e CSS próprios (app/design/lib/tokens, .ds-pill-select): o Escolha traria o tema do CRM para dentro da comparação que ele existe para isolar",
};

const TIPO_NATIVO = /\btype=(?:"(?:date|time|datetime-local)"|\{\s*["'](?:date|time|datetime-local)["']\s*\})/g;
const MARCA = "__campo_nativo_de_data__";

/**
 * Tira comentários e textos entre aspas (`<select>` citado em texto não é
 * controle). O `type="date"` é atributo JSX e é o que se procura: vira uma
 * marca antes de os textos saírem.
 */
export function semComentariosNemTextos(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")
    .replace(TIPO_NATIVO, MARCA)
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

export function controlesNativos(fonte: string): string[] {
  const limpo = semComentariosNemTextos(fonte);
  const achados: string[] = [];
  if (/<select[\s>]/.test(limpo)) achados.push("<select>");
  if (limpo.includes(MARCA)) achados.push('type="date|time|datetime-local"');
  return achados;
}

function arquivosTsx(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosTsx(caminho));
    else if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

const ARQUIVOS = PASTAS.flatMap((p) => arquivosTsx(join(RAIZ, p)))
  .map((c) => relative(RAIZ, c).split(sep).join("/"))
  .filter((c) => !c.startsWith("components/ui/"));

describe("cerca: controle nativo de data, hora e seletor só em components/ui", () => {
  it("nenhum arquivo fora de components/ui usa <select> ou campo nativo de data/hora", () => {
    const culpados = ARQUIVOS.filter((c) => !(c in EXCECOES))
      .map((c) => ({ c, achados: controlesNativos(readFileSync(join(RAIZ, c), "utf8")) }))
      .filter((x) => x.achados.length > 0)
      .map((x) => `${x.c}: ${x.achados.join(", ")} (use Escolha ou CampoDeData de components/ui)`);
    expect(culpados).toEqual([]);
  });

  it("toda exceção ainda tem controle nativo (a lista só encolhe)", () => {
    const vencidas = Object.keys(EXCECOES).filter(
      (c) => !ARQUIVOS.includes(c) || controlesNativos(readFileSync(join(RAIZ, c), "utf8")).length === 0,
    );
    expect(vencidas).toEqual([]);
  });

  it("varre de verdade: os componentes do DS existem e a varredura acha arquivos", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(100);
    expect(readFileSync(join(RAIZ, "components/ui/escolha.tsx"), "utf8")).toContain("<select");
  });

  it("CONTROLE NEGATIVO: o detector acha select e campo de data, e ignora citação em texto", () => {
    expect(controlesNativos('<select value={x} onChange={f}>')).toEqual(["<select>"]);
    expect(controlesNativos("<select\n  id=\"a\"\n>")).toEqual(["<select>"]);
    expect(controlesNativos('<Input type="date" value={d} />')).toEqual(['type="date|time|datetime-local"']);
    expect(controlesNativos('<input type={"time"} />')).toEqual(['type="date|time|datetime-local"']);
    expect(controlesNativos('<input type="datetime-local" />')).toEqual(['type="date|time|datetime-local"']);
    expect(controlesNativos('// um <select> antigo\n/* <input type="date"> */')).toEqual([]);
    expect(controlesNativos('t("O <select> nativo saiu")')).toEqual([]);
    expect(controlesNativos('<Escolha value={x} />\n<input type="text" />')).toEqual([]);
  });
});
