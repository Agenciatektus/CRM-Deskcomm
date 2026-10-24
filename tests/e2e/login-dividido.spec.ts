/**
 * E2E — a tela de login dividida, nos três tamanhos.
 *
 * O unit (`tests/unit/tela-de-login-dividida.test.tsx`) prova o HTML e a
 * hidratação; o que ele não alcança é a PINTURA: jsdom não resolve CSS. Este
 * spec mede no navegador o que o desenho promete:
 *
 *  - desktop (≥ 1024 px): a imagem fica à esquerda, o formulário à direita, e o
 *    formulário tem ~400 px;
 *  - tablet e celular (< 1024 px): a imagem é uma faixa estreita NO TOPO e o
 *    formulário vem logo abaixo, sem rolagem horizontal;
 *  - o formulário aceita digitação antes de a imagem terminar de carregar;
 *  - sem o arquivo da imagem, o painel não vira buraco nem mostra ícone quebrado.
 *
 * Não loga ninguém: a tela existe antes de qualquer sessão.
 */
import { test, expect } from "./helpers/test";

const IMAGEM = "[data-testid='imagem-do-acesso']";

const TAMANHOS = [
  { nome: "desktop", largura: 1440, altura: 900 },
  { nome: "tablet", largura: 820, altura: 1180 },
  { nome: "celular", largura: 390, altura: 844 },
] as const;

for (const { nome, largura, altura } of TAMANHOS) {
  test(`login ${nome} (${largura} px): layout, sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/login");

    const imagem = page.locator(IMAGEM);
    const email = page.locator("#email");
    await expect(imagem).toBeVisible();
    await expect(email).toBeVisible();

    const rolagem = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      janela: document.documentElement.clientWidth,
    }));
    expect(rolagem.conteudo, `${nome}: há rolagem horizontal`).toBeLessThanOrEqual(rolagem.janela);

    const caixaImagem = (await imagem.boundingBox())!;
    const caixaCampo = (await email.boundingBox())!;

    if (largura >= 1024) {
      // Duas colunas: a imagem inteira à esquerda do campo, altura de tela cheia.
      expect(caixaImagem.x + caixaImagem.width).toBeLessThanOrEqual(caixaCampo.x);
      expect(caixaImagem.height).toBeGreaterThan(altura * 0.9);
      expect(caixaCampo.width).toBeGreaterThan(300);
      expect(caixaCampo.width).toBeLessThanOrEqual(400);
    } else {
      // Faixa no topo: estreita, de ponta a ponta, e o formulário logo abaixo.
      expect(caixaImagem.y).toBeLessThanOrEqual(1);
      expect(caixaImagem.height).toBeLessThanOrEqual(120);
      expect(caixaImagem.width).toBeGreaterThanOrEqual(largura - 1);
      expect(caixaCampo.y).toBeGreaterThanOrEqual(caixaImagem.y + caixaImagem.height);
    }
  });
}

test("o formulário aceita digitação antes de a imagem terminar de carregar", async ({ page }) => {
  let liberar!: () => void;
  const segura = new Promise<void>((ok) => (liberar = ok));
  await page.route("**/login/marca*", async (rota) => {
    await segura;
    await rota.continue();
  });

  await page.goto("/login", { waitUntil: "commit" });
  await page.fill("#email", "pessoa@exemplo.com");
  await expect(page.locator("#email")).toHaveValue("pessoa@exemplo.com");
  // A imagem ainda está presa: o formulário não dependeu dela.
  expect(await page.evaluate(() => document.querySelector<HTMLImageElement>("picture img")!.complete)).toBe(false);
  liberar();
});

test("sem o arquivo da imagem, o painel não mostra ícone quebrado", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/login/marca*", (rota) => rota.abort());
  await page.goto("/login");

  await expect(page.locator(IMAGEM)).toBeVisible();
  await expect(page.locator("picture img")).toBeHidden();
  await expect(page.locator("#email")).toBeVisible();
});
