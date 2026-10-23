import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MarcaDeSaida } from "@/lib/branding/saida";
import { IMAGEM_DA_FACHADA } from "@/lib/branding/fachada";

/**
 * A TELA DE LOGIN DIVIDIDA — imagem de um lado, formulário do outro.
 *
 * O que ESTE arquivo prova, e o que ele deixa para o navegador:
 *
 *  - prova (HTML): o formulário vem ANTES da imagem no DOM (foco e leitor de
 *    tela chegam nele primeiro), a imagem é decorativa (`alt=""`), carrega com
 *    prioridade e nunca com `src` vazio, e o `<picture>` oferece retrato no
 *    desktop e 16:9 abaixo dele, AVIF antes de WebP antes de JPG;
 *  - prova (hidratação): o servidor e o navegador desenham o MESMO HTML nos
 *    três tamanhos — não há `matchMedia` nem medida de janela na casca, o
 *    tamanho só existe em CSS e no `media` do `<source>`;
 *  - prova (arquivos): os nove arquivos existem e têm as dimensões que
 *    `lib/branding/fachada.ts` declara, e o caminho mora só ali;
 *  - NÃO prova a pintura (cantos, contraste do texto sobre a arte, rolagem
 *    horizontal): jsdom não resolve CSS. Isso é medido na tela, com captura,
 *    nos três tamanhos (ver o relatório da PR).
 */

const marcaDaSaida = vi.hoisted(() => vi.fn());
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));
vi.mock("@/lib/i18n/idiomaAnonimo", () => ({ idiomaDoVisitante: vi.fn(async () => "pt-BR") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/app/actions/auth/signInWithPassword", () => ({ signInWithPassword: vi.fn() }));

const MARCA: MarcaDeSaida = {
  nome: "Vendas Turbo",
  logoUrl: null,
  accent: "#2f6f4e",
  accentFg: "#ffffff",
  origens: { nome: "banco", cor: "banco" },
};

async function arvoreDaCasca() {
  marcaDaSaida.mockResolvedValue(MARCA);
  const { default: PublicLayout } = await import("@/app/(public)/layout");
  return PublicLayout({ children: <p>formulário</p> });
}

beforeEach(() => {
  vi.resetModules();
  marcaDaSaida.mockReset();
});

describe("a casca dividida: o HTML", () => {
  it("o formulário vem antes da imagem, e o conteúdo está dentro de um <main>", async () => {
    const html = renderToStaticMarkup(await arvoreDaCasca());

    const formulario = html.indexOf("formulário");
    const imagem = html.indexOf('data-testid="imagem-do-acesso"');
    expect(formulario, "o conteúdo da página sumiu da casca").toBeGreaterThan(-1);
    expect(imagem, "a imagem sumiu da casca").toBeGreaterThan(-1);
    expect(formulario, "a imagem passou na frente do formulário no DOM").toBeLessThan(imagem);
    expect(html.indexOf("<main")).toBeLessThan(formulario);
    // `order-first`: a faixa sobe para o topo no celular mesmo vindo depois no DOM.
    const tag = html.match(/<div\b[^>]*data-testid="imagem-do-acesso"[^>]*>/)?.[0] ?? "";
    expect(tag).toMatch(/class="[^"]*\border-first\b/);
  });

  it("a imagem é decorativa, prioritária e nunca tem `src` vazio", async () => {
    const html = renderToStaticMarkup(await arvoreDaCasca());
    const img = html.match(/<img\b[^>]*>/)?.[0] ?? "";

    expect(img, "não há <img> na imagem do acesso").not.toBe("");
    expect(img).toContain('alt=""');
    expect(img).toMatch(/fetchPriority="high"/i);
    expect(img).not.toContain('loading="lazy"');
    expect(img).toContain(`src="${IMAGEM_DA_FACHADA.faixa.base}.jpg"`);
    expect(html).not.toContain('src=""');
  });

  it("o <picture> escolhe o retrato no desktop e a faixa abaixo, do formato mais leve ao de reserva", async () => {
    const html = renderToStaticMarkup(await arvoreDaCasca());
    const fontes = [...html.matchAll(/<source\b[^>]*>/g)].map((m) => m[0]);
    const { retrato, faixa } = IMAGEM_DA_FACHADA;

    const ordem = fontes.map((f) => ({
      desktop: f.includes("min-width: 1024px"),
      arquivo: f.match(/srcSet="([^"]+)"/i)?.[1],
    }));
    expect(ordem).toEqual([
      { desktop: true, arquivo: `${retrato.base}.avif` },
      { desktop: true, arquivo: `${retrato.base}.webp` },
      { desktop: true, arquivo: `${retrato.base}.jpg` },
      { desktop: false, arquivo: `${faixa.base}.avif` },
      { desktop: false, arquivo: `${faixa.base}.webp` },
    ]);
  });

  it("o painel é escuro nos dois temas e cai num degradê da marca se o arquivo não carregar", async () => {
    const html = renderToStaticMarkup(await arvoreDaCasca());

    expect(html).toMatch(/data-theme="dark"[^>]*data-testid="imagem-do-acesso"/);
    expect(html).toContain("--pele-grad-soft");
  });

  it("a frase sobre a imagem passa por t(): em espanhol não sobra português", async () => {
    const { traduzir } = await import("@/lib/i18n/dicionario");
    for (const frase of [
      "Atendimento, funil e IA no mesmo lugar.",
      "Cada conversa vira uma oportunidade acompanhada.",
      "Acesse sua conta em",
    ]) {
      expect(traduzir(frase, "es"), frase).not.toBe(frase);
    }
  });
});

describe("a casca dividida: hidratação", () => {
  let erros: unknown[];
  let console_error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    erros = [];
    console_error = vi.spyOn(console, "error").mockImplementation((...args) => {
      erros.push(args);
    });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    console_error.mockRestore();
    document.body.innerHTML = "";
  });

  // Os três tamanhos têm o MESMO HTML: o que muda é CSS. Hidratar uma vez prova
  // que servidor e navegador concordam em todos eles.
  it.each([
    ["desktop", 1440],
    ["tablet", 820],
    ["celular", 390],
  ])("%s (%i px): servidor e navegador desenham o mesmo HTML", async (_nome, largura) => {
    vi.stubGlobal("innerWidth", largura);
    const arvore = await arvoreDaCasca();
    const raiz = document.createElement("div");
    document.body.appendChild(raiz);
    raiz.innerHTML = renderToString(arvore);
    const antes = raiz.innerHTML;

    await act(async () => {
      hydrateRoot(raiz, arvore, { onRecoverableError: (e) => erros.push(e) });
    });

    expect(erros, `divergência de hidratação a ${largura} px`).toEqual([]);
    expect(raiz.innerHTML).toBe(antes);
    vi.unstubAllGlobals();
  });
});

describe("a imagem: arquivos e caminho", () => {
  const RAIZ = process.cwd();

  /** Largura e altura do JPG, lidas do primeiro marcador SOF — sem biblioteca. */
  function dimensoesDoJpg(arquivo: string): { largura: number; altura: number } {
    const b = readFileSync(arquivo);
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marcador = b[i + 1] ?? 0;
      const tamanho = b.readUInt16BE(i + 2);
      if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
        return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
      }
      i += 2 + tamanho;
    }
    throw new Error(`${arquivo}: sem marcador SOF`);
  }

  it.each(Object.entries(IMAGEM_DA_FACHADA))(
    "%s existe em AVIF, WebP e JPG, e o JPG tem as dimensões declaradas",
    (_nome, img) => {
      for (const ext of ["avif", "webp", "jpg"]) {
        const arquivo = join(RAIZ, "public", `${img.base}.${ext}`);
        expect(statSync(arquivo).size, `${img.base}.${ext} está vazio`).toBeGreaterThan(1000);
      }
      expect(dimensoesDoJpg(join(RAIZ, "public", `${img.base}.jpg`))).toEqual({
        largura: img.largura,
        altura: img.altura,
      });
    },
  );

  it("o caminho da imagem mora num lugar só: lib/branding/fachada.ts", () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          if (/["'`]\/login\/marca/.test(readFileSync(p, "utf8")))
            achados.push(p.slice(RAIZ.length + 1));
        }
      }
    };
    for (const pasta of ["app", "components", "lib"]) varrer(join(RAIZ, pasta));

    expect(achados.map((a) => a.replaceAll("\\", "/"))).toEqual(["lib/branding/fachada.ts"]);
  });
});

describe("o formulário: a ordem do Tab", () => {
  it("'Esqueci minha senha' vem depois do campo de senha no DOM, mesmo aparecendo na linha do rótulo", async () => {
    const { LoginForm } = await import("@/components/auth/LoginForm");
    const html = renderToStaticMarkup(<LoginForm />);

    const campo = html.indexOf('id="password"');
    const link = html.indexOf('href="/login/forgot"');
    const botao = html.indexOf('type="submit"');
    expect(campo).toBeGreaterThan(-1);
    expect(link, "o link de recuperação sumiu do formulário").toBeGreaterThan(-1);
    expect(campo).toBeLessThan(link);
    expect(link).toBeLessThan(botao);
  });
});

describe("a imagem que não carrega", () => {
  it("some o <img> (sem ícone de imagem quebrada) e deixa o degradê do painel", async () => {
    const { cleanup, fireEvent, render } = await import("@testing-library/react");
    const { ImagemDeMarcaDoAcesso } = await import("@/components/auth/ImagemDeMarcaDoAcesso");
    const { container } = render(<ImagemDeMarcaDoAcesso />);
    const img = container.querySelector("picture img") as HTMLImageElement;

    expect(img.className).not.toContain("hidden");
    fireEvent.error(img);

    expect(img.className).toBe("hidden");
    // O painel continua lá, com o degradê por baixo: não vira um buraco.
    expect(container.querySelector('[data-testid="imagem-do-acesso"]')).not.toBeNull();
    expect(container.innerHTML).toContain("--pele-grad-soft");
    cleanup();
  });
});
