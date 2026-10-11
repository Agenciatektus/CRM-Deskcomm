/**
 * Converte a cor que o NAVEGADOR computou em hex, para a vitrine do design
 * system mostrar o valor e medir contraste.
 *
 * Por que do navegador, e não do `globals.css`: o valor que importa é o que a
 * tela pinta, e ele depende de onde se está (tema do `<html>`, subárvore
 * `data-theme`, marca da instalação no `:root`, marca da organização no
 * `<body>`). Só o motor de CSS junta as quatro camadas.
 *
 * `getComputedStyle` devolve a cor em formas variadas (`rgb()`, `oklch()`,
 * `color(srgb …)`, conforme o valor de origem). Um canvas de 1px é o único
 * conversor que aceita toda forma de cor CSS sem que este arquivo tenha de
 * conhecer cada uma.
 *
 * Fora do navegador (teste em jsdom, SSR) devolve `null`: quem chama mostra "—".
 */

let canvas: HTMLCanvasElement | null = null;

function contexto(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  canvas ??= document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.getContext("2d", { willReadFrequently: true });
}

function hex2(n: number): string {
  return Math.round(n).toString(16).padStart(2, "0");
}

/**
 * Pinta as camadas em ordem (a primeira é o fundo) e devolve o pixel em hex.
 * Com uma camada só, é a conversão pura; com duas, a cor translúcida composta
 * sobre o fundo (é assim que se mede `--color-success-bg`, que é `rgba` no claro).
 */
export function hexDasCamadas(camadas: string[]): string | null {
  const ctx = contexto();
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  for (const c of camadas) {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
  }
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}
