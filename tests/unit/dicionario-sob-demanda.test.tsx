import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DICIONARIO } from "@/lib/i18n/dicionario";
import { esquecerEspera, IdiomaProvider, useAplicarIdioma, useT } from "@/lib/i18n/IdiomaProvider";
import {
  carregarDicionario,
  dicionarioPronto,
  esquecerDicionario,
  registrarDicionario,
  traduzir,
} from "@/lib/i18n/traducao";

/**
 * O dicionário de espanhol (~1 MB, ~270 KB gzip) sai do JS inicial: quem fala
 * português não baixa nada, e quem fala espanhol nunca vê a tela em português
 * enquanto ele chega.
 *
 * O setup da suíte registra o dicionário (estado "pronto"); aqui cada caso o
 * esquece antes, para medir o caminho do download.
 */

function Texto() {
  const t = useT();
  return <p>{t("Arquivo")}</p>;
}

function Trocar() {
  const aplicar = useAplicarIdioma();
  return (
    <button type="button" onClick={() => aplicar("es")}>
      trocar
    </button>
  );
}

beforeEach(() => {
  esquecerDicionario();
  esquecerEspera();
});

afterEach(() => {
  // Devolve o estado que o resto da suíte espera.
  registrarDicionario(DICIONARIO);
});

describe("traduzir leve", () => {
  it("antes do dicionário chegar devolve o português; depois, a tradução", async () => {
    expect(dicionarioPronto("es")).toBe(false);
    expect(traduzir("Arquivo", "es")).toBe("Arquivo");
    await carregarDicionario();
    expect(dicionarioPronto("es")).toBe(true);
    expect(traduzir("Arquivo", "es")).toBe("Archivo");
  });

  it("português nunca depende do dicionário", () => {
    expect(dicionarioPronto("pt-BR")).toBe(true);
    expect(traduzir("Arquivo", "pt-BR")).toBe("Arquivo");
  });
});

describe("IdiomaProvider", () => {
  it("em português pinta na hora e NÃO baixa o dicionário", () => {
    render(
      <IdiomaProvider locale="pt-BR">
        <Texto />
      </IdiomaProvider>,
    );
    expect(screen.getByText("Arquivo")).toBeInTheDocument();
    expect(dicionarioPronto("es")).toBe(false);
  });

  it("em espanhol espera o dicionário: nunca mostra o português no meio", async () => {
    // `render` suspende (o Suspense do provider): o `act` tem de ser aguardado,
    // senão o React não retoma a árvore quando o dicionário chega.
    await act(async () => {
      render(
        <IdiomaProvider locale="es">
          <Texto />
        </IdiomaProvider>,
      );
    });
    expect(screen.queryByText("Arquivo")).toBeNull();
    // O próprio provider pediu o dicionário; quando ele chega, o Suspense retoma
    // (o React ainda segura a revelação por ~300 ms, daí o prazo maior).
    expect(await screen.findByText("Archivo", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("Arquivo")).toBeNull();
  });

  it("trocar para espanhol mantém a tela em português até o dicionário chegar (sem sumir no meio)", async () => {
    render(
      <IdiomaProvider locale="pt-BR">
        <Texto />
        <Trocar />
      </IdiomaProvider>,
    );
    act(() => screen.getByRole("button", { name: "trocar" }).click());
    // No mesmo instante do clique a tela continua inteira, no idioma de antes.
    expect(screen.getByText("Arquivo")).toBeInTheDocument();
    expect(await screen.findByText("Archivo", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe("cerca: módulo do navegador não importa o dicionário pesado", () => {
  it('nenhum arquivo "use client" importa lib/i18n/dicionario', () => {
    const arquivos = execSync("git ls-files", { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.|\.spec\.|^tests\//.test(f));
    const culpados = arquivos.filter((f) => {
      const src = readFileSync(f, "utf8");
      return (
        /^\s*["']use client["']/.test(src) &&
        /from\s+["'](@\/lib\/i18n\/dicionario|\.\/dicionario)["']/.test(src)
      );
    });
    expect(culpados, "use `@/lib/i18n/traducao` no navegador").toEqual([]);
  });
});
