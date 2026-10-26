"use client";

import { useState } from "react";

import { IMAGENS, PASTA_IMAGENS, type IdImagem } from "@/lib/imagens";

/**
 * Slot de imagem decorativa da LP. `<picture>` com AVIF, WebP e JPG, `width`/`height` do arquivo (sem CLS),
 * `alt` vazio e `aria-hidden`. Sem arquivo (mapa em `lib/imagens.ts`) ou com falha de carregamento, mostra
 * a luz CSS do slot (`fallback`) em vez de uma imagem quebrada. A imagem sempre entra sob máscara
 * (`mascara`, uma classe `[mask-image:...]`), em `mix-blend-screen` e com opacidade moderada.
 * O wrapper é `absolute`: o pai precisa ser `relative` e posicionar o slot pela `className`.
 */
export function ImagemDeSlot({
  id,
  className = "inset-0",
  mascara = "",
  opacidade = 0.55,
  prioridade = false,
  fallback = "fundo-brilho-azul",
  imgClassName = "size-full object-cover",
}: {
  id: IdImagem;
  className?: string;
  mascara?: string;
  opacidade?: number;
  /** Só o slot do hero: acima da dobra, sem lazy. */
  prioridade?: boolean;
  /** Classe de fundo (`fundo-brilho-*`) usada quando a imagem não existe ou falha. */
  fallback?: string;
  imgClassName?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  const m = IMAGENS[id];
  const base = `${PASTA_IMAGENS}/${id}`;

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute mix-blend-screen ${className} ${mascara}`}>
      {!m.disponivel || falhou ? (
        <div className={`size-full ${fallback}`} />
      ) : (
        <picture>
          <source srcSet={`${base}.avif`} type="image/avif" />
          <source srcSet={`${base}.webp`} type="image/webp" />
          <img
            src={`${base}.jpg`}
            alt=""
            width={m.largura}
            height={m.altura}
            loading={prioridade ? "eager" : "lazy"}
            fetchPriority={prioridade ? "high" : "low"}
            decoding="async"
            onError={() => setFalhou(true)}
            style={{ opacity: opacidade }}
            className={imgClassName}
          />
        </picture>
      )}
    </div>
  );
}
