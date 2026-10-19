import { SIMBOLO } from "./desenho";

/**
 * As camadas do símbolo do produto (degradês + peças) para pôr DENTRO de um
 * `<svg viewBox={SIMBOLO.viewBox}>`. Serve à tela e aos ícones gerados pelo
 * `ImageResponse` (o satori aceita `<linearGradient>` em SVG inline).
 *
 * `prefixo` existe porque o `id` do degradê é global no documento: dois
 * símbolos na mesma página com o mesmo id fariam o segundo usar o degradê do
 * primeiro, e se o primeiro estiver escondido (barra recolhida) o segundo
 * perde a cor. A tela passa um `useId()`; o ícone, um texto fixo.
 */
export function CamadasDoSimbolo({ prefixo }: { prefixo: string }) {
  const id = (i: number) => `${prefixo.replace(/[^a-zA-Z0-9_-]/g, "")}-simbolo-${i}`;
  // Lista com chave, e não fragmento: o satori (ícones via `ImageResponse`) só
  // aceita elementos nativos dentro de `<svg>` e recusa até o `<>`.
  return [
      <defs key="defs">
        {SIMBOLO.gradientes.map((g, i) => (
          <linearGradient key={i} id={id(i)} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} gradientUnits="userSpaceOnUse">
            {g.paradas.map(([offset, cor]) => (
              <stop key={offset} offset={offset} stopColor={cor} />
            ))}
          </linearGradient>
        ))}
      </defs>,
      ...SIMBOLO.caminhos.map((c) => (
        <path key={c.gradiente} d={c.d} fill={`url(#${id(c.gradiente)})`} />
      )),
  ];
}
