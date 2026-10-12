/**
 * O DESENHO da marca do produto — símbolo e logotipo — como geometria pura.
 *
 * Mora aqui, e não num `.svg` em `public/`, por duas razões que a doutrina de
 * marca própria já paga:
 *
 *  1. `public/` é servido a todo mundo, sempre. Um arquivo fixo ali seria a
 *     marca do PRODUTO na instalação de um revendedor que configurou a dele —
 *     é exatamente o vazamento que `tests/unit/branding.test.ts` vigia. Como
 *     geometria, o desenho só aparece onde um componente decide que a marca em
 *     vigor é a padrão (`marcaEhADoProduto`, em `lib/branding.ts`).
 *  2. O favicon (`app/icon.tsx`) é gerado em runtime pelo `ImageResponse`, que
 *     aceita SVG inline mas não lê arquivo do disco. Um único desenho alimenta
 *     a tela e o ícone — dois arquivos divergiriam na primeira revisão da marca.
 *
 * As cores NÃO estão aqui de propósito: quem desenha escolhe (a tela lê os
 * tokens do tema; o favicon lê a régua do produto). A fonte deste arquivo são
 * os SVGs em `docs/brand/`; ao trocar a arte, regenere os dois lados a partir
 * deles.
 */

/** Glifo com a transformação que o posiciona no `viewBox` do logotipo. */
export type Glifo = { readonly transform: string; readonly d: string };

/**
 * O símbolo: o V da Verdash, SEM fundo, o mesmo `public/logo_verdash.svg` do
 * Verdash (cópia da fonte em `docs/brand/verdash-simbolo.svg`). Três peças com
 * degradê próprio: o V (`#1042F6` → `#00FFB0`) e as duas barras
 * (`#FF3871` → `#FF6F1B`). Decisão do Peterson na etapa 2 do design system:
 * substitui o D aberto pintado em sálvia. O degradê é o mesmo nos dois temas,
 * e por isso o desenho não precisa de caixa de fundo.
 */
export type GradienteDoSimbolo = {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly paradas: readonly (readonly [offset: number, cor: string])[];
};

export const SIMBOLO = {
  viewBox: "0 0 193 212",
  caminhos: [
    {
      gradiente: 0,
      d: "M64.4429 190L3.44288 68.5C-2.79251 57.7 0.844801 55.3333 3.44288 55.5H39.9429C47.1429 55.5 50.9429 62.5 51.9429 66C66.4429 96.6666 96.1429 159.4 98.9429 165C101.743 170.6 105.11 168.667 106.443 167C128.943 147.5 176.143 106.5 184.943 98.5C193.743 90.5 193.61 98.1666 192.443 103C178.086 131 147.985 189.4 142.443 199C136.9 208.6 128.133 211.667 124.443 212H88.9429C75.3429 212 66.9429 197.333 64.4429 190Z",
    },
    {
      gradiente: 1,
      d: "M139.443 5C139.443 2.23857 141.681 0 144.443 0H187.443C190.204 0 192.443 2.23858 192.443 5V71.644C192.443 73.0722 191.832 74.4322 190.765 75.3811L147.765 113.603C144.54 116.469 139.443 114.18 139.443 109.866V5Z",
    },
    {
      gradiente: 2,
      d: "M82.4429 51C82.4429 48.2386 84.6814 46 87.4429 46H121.443C124.204 46 126.443 48.2386 126.443 51V128.763C126.443 130.186 125.836 131.542 124.775 132.491L107.94 147.534C105.447 149.762 101.511 148.962 100.086 145.937L82.92 109.512C82.6058 108.846 82.4429 108.118 82.4429 107.381V51Z",
    },
  ],
  gradientes: [
    { x1: 0, y1: 133.746, x2: 193.007, y2: 133.746, paradas: [[0, "#1042F6"], [1, "#00FFB0"]] },
    { x1: 139.443, y1: 0, x2: 165.943, y2: 121, paradas: [[0.331731, "#FF3871"], [1, "#FF6F1B"]] },
    { x1: 82.4429, y1: 46, x2: 104.443, y2: 152, paradas: [[0.456731, "#FF3871"], [1, "#FF6F1B"]] },
  ] as readonly GradienteDoSimbolo[],
} as const;

/**
 * O logotipo: símbolo + "Verdash" + "CRM", com o texto já convertido em
 * caminhos (não depende de fonte instalada nem de `@font-face`).
 *
 * ⚠️ DECISÃO DO FORK (Verdash/Tektus), não do upstream DeskcommCRM: a marca
 * padrão deste fork é "Verdash CRM" (`DEFAULT_APP_NAME`, `lib/branding.ts`).
 * Ao sincronizar com o upstream, este arquivo e o nome padrão ficam com o fork.
 * Os glifos saíram da fonte da interface (`app/fonts/atkinson-*`) com fontTools.
 */
export const LOGOTIPO = {
  viewBox: "51 25 650 211",
  /** Proporção largura/altura do `viewBox`, para dimensionar por altura. */
  proporcao: 650 / 211,
  /** O V ocupa a caixa que o símbolo antigo ocupava (x 71 a 242, y 45 a 215). */
  simbolo: { transform: "translate(79 45) scale(0.802)" },
  /** "Verdash" em Atkinson Hyperlegible Next 700, a fonte da interface. */
  nome: [
    {
      transform: "translate(268 151) scale(0.107784 -0.107784)",
      d: "M237 0 10 668H163L321 164L480 668H634L406 0Z",
    },
    {
      transform: "translate(337.41 151) scale(0.107784 -0.107784)",
      d: "M296 -12Q216 -12 156.0 20.0Q96 52 63.0 111.0Q30 170 30 250Q30 329 65.5 387.0Q101 445 160.5 477.0Q220 509 291 509Q351 509 399.5 486.5Q448 464 481.0 424.0Q514 384 529.5 329.5Q545 275 540 211H167Q173 180 185.5 158.5Q198 137 215.0 123.5Q232 110 252.5 104.0Q273 98 293 98Q329 98 355.0 109.0Q381 120 396 137L509 97Q473 42 416.0 15.0Q359 -12 296 -12ZM166 298H409Q408 331 392.5 354.5Q377 378 352.0 391.0Q327 404 294 404Q265 404 238.0 393.5Q211 383 192.5 360.5Q174 338 166 298Z",
    },
    {
      transform: "translate(398.1 151) scale(0.107784 -0.107784)",
      d: "M57 0V496H165L192 405Q209 443 232.0 466.5Q255 490 286.0 500.0Q317 510 356 509V369Q301 375 266.0 363.0Q231 351 213.5 321.5Q196 292 196 243V0Z",
    },
    {
      transform: "translate(438.62 151) scale(0.107784 -0.107784)",
      d: "M247 -12Q185 -12 135.5 19.5Q86 51 58.0 110.5Q30 170 30 251Q30 332 58.0 389.5Q86 447 135.5 478.0Q185 509 247 509Q292 509 334.5 488.0Q377 467 400 426V708H539V193Q539 158 542.5 107.5Q546 57 556 0H424L404 65Q373 25 332.0 6.5Q291 -12 247 -12ZM291 97Q324 97 349.5 113.0Q375 129 390.5 162.5Q406 196 406 248Q406 327 372.5 363.5Q339 400 291 400Q243 400 209.0 361.5Q175 323 175 251Q175 178 209.0 137.5Q243 97 291 97Z",
    },
    {
      transform: "translate(502.86 151) scale(0.107784 -0.107784)",
      d: "M196 -12Q149 -12 110.0 5.5Q71 23 48.0 55.5Q25 88 25 133Q25 192 66.0 228.0Q107 264 183.0 283.5Q259 303 360 311V325Q360 370 336.0 391.5Q312 413 267 413Q233 413 208.5 397.0Q184 381 176 350L57 392Q80 443 136.5 476.0Q193 509 273 509Q380 509 436.5 461.5Q493 414 493 303V193Q493 159 495.0 122.5Q497 86 501.0 54.0Q505 22 510 0H381L362 62Q336 23 293.5 5.5Q251 -12 196 -12ZM246 85Q278 85 304.0 96.0Q330 107 345.0 133.0Q360 159 360 204V225Q269 218 219.0 200.0Q169 182 169 142Q169 116 190.5 100.5Q212 85 246 85Z",
    },
    {
      transform: "translate(562.36 151) scale(0.107784 -0.107784)",
      d: "M258 -13Q202 -13 154.5 2.0Q107 17 72.0 45.0Q37 73 19 114L139 157Q148 125 183.0 107.5Q218 90 260 90Q298 90 327.0 103.5Q356 117 356 143Q356 162 338.0 174.5Q320 187 275 195L195 209Q148 218 112.5 236.0Q77 254 56.5 283.0Q36 312 36 353Q36 404 67.0 439.0Q98 474 148.5 491.5Q199 509 257 509Q327 509 387.5 483.0Q448 457 476 396L356 353Q345 380 318.0 393.5Q291 407 253 407Q213 407 191.0 394.0Q169 381 169 360Q169 342 184.0 332.0Q199 322 234 315L317 300Q376 289 414.5 271.5Q453 254 472.0 225.5Q491 197 491 152Q491 98 459.5 61.0Q428 24 375.5 5.5Q323 -13 258 -13Z",
    },
    {
      transform: "translate(617.11 151) scale(0.107784 -0.107784)",
      d: "M57 0V708H196V428Q207 448 228.5 466.0Q250 484 280.5 496.5Q311 509 350 509Q413 509 449.5 485.0Q486 461 501.5 415.0Q517 369 517 304V0H377V269Q377 304 372.5 334.0Q368 364 351.0 382.0Q334 400 295 400Q245 400 220.5 364.0Q196 328 196 258V0Z",
    },
  ] as readonly Glifo[],
  /** "CRM" em Atkinson Hyperlegible Next 400. */
  sufixo: [
    {
      transform: "translate(273 191) scale(0.026198 -0.026198)",
      d: "M347 -12Q251 -12 183.5 32.5Q116 77 80.0 155.0Q44 233 44 335Q44 439 82.5 516.5Q121 594 191.0 637.0Q261 680 355 680Q439 680 506.5 641.0Q574 602 608 529L526 499Q504 544 459.5 572.5Q415 601 350 601Q291 601 243.5 571.0Q196 541 168.0 481.5Q140 422 140 335Q140 251 167.0 191.0Q194 131 242.5 99.0Q291 67 353 67Q397 67 431.0 80.0Q465 93 490.0 116.0Q515 139 530 169L612 139Q576 65 506.0 26.5Q436 -12 347 -12Z",
    },
    {
      transform: "translate(289.9 191) scale(0.026198 -0.026198)",
      d: "M78 0V668H325Q397 668 452.0 647.0Q507 626 538.0 583.0Q569 540 569 472Q569 386 517.5 340.0Q466 294 383 283L588 0H474L277 277H172V0ZM172 358H327Q369 358 402.0 369.0Q435 380 454.0 405.0Q473 430 473 472Q473 515 454.0 540.0Q435 565 402.0 576.0Q369 587 327 587H172Z",
    },
    {
      transform: "translate(305.98 191) scale(0.026198 -0.026198)",
      d: "M78 0V668H234L412 122L590 668H746V0H652V570L459 0H366L172 570V0Z",
    },
  ] as readonly Glifo[],
} as const;

/**
 * As cores do TEXTO da marca do produto, por tema: os mesmos graus da régua
 * (`regua-do-produto.ts`), neutro 900/0 para o nome e neutro 600/300 para o
 * "CRM". O símbolo não entra: ele tem o degradê próprio (`SIMBOLO.gradientes`).
 */
export const CORES_DA_MARCA = {
  claro: { nome: "#171d26", sufixo: "#474d58" },
  escuro: { nome: "#f8f8f8", sufixo: "#a1a5aa" },
} as const;
