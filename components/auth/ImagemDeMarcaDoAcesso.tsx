"use client";

import { getImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { BREAKPOINT_DO_PAINEL, IMAGEM_DA_FACHADA } from "@/lib/branding/fachada";

/**
 * O lado da IMAGEM da tela de acesso: painel de altura inteira no desktop
 * (≥ 1024 px), faixa estreita no topo abaixo disso. É decorativa (`alt=""`) e
 * sempre escura, nos dois temas — `data-theme="dark"` faz os tokens daqui
 * resolverem o escuro mesmo com a página clara.
 *
 * ── Por que `getImageProps` + `<picture>`, e não `<Image priority>` ───────────
 *
 * Duas composições (retrato e 16:9) em três formatos, e a otimização do
 * `next/image` está desligada nesta imagem (`images.unoptimized`). `<Image
 * priority>` injeta um `<link rel="preload">` do `src` — o JPG de reserva — e o
 * navegador baixaria o JPG E o AVIF que o `<picture>` escolheu. `getImageProps`
 * dá os mesmos atributos (dimensões, `decoding`, `fetchPriority="high"`, carga
 * imediata) sem o preload, e o `<picture>` escolhe formato e composição.
 *
 * ── O formulário não espera a imagem ──────────────────────────────────────────
 *
 * O HTML do formulário vem completo do servidor; a imagem é um recurso à parte
 * que ele não referencia. Se o arquivo não carregar, o fundo é o degradê suave
 * da marca sobre o fundo escuro (`--pele-grad-soft`), e não um buraco.
 */
export function ImagemDeMarcaDoAcesso() {
  const t = useT();
  const imagem = useRef<HTMLImageElement>(null);
  const [falhou, setFalhou] = useState(false);
  const { faixa, retrato } = IMAGEM_DA_FACHADA;

  const { props } = getImageProps({
    src: `${faixa.base}.jpg`,
    alt: "",
    width: faixa.largura,
    height: faixa.altura,
    priority: true,
    // `priority` sozinho não chega ao `<img>` em `getImageProps` (só o `<Image>` o
    // converte em preload): o atributo vai explícito.
    fetchPriority: "high",
    loading: "eager",
    unoptimized: true,
    className: "absolute inset-0 h-full w-full object-cover object-[50%_12%] lg:object-[30%_50%]",
  });

  // Arquivo que não carregou: some o <img> (o navegador desenharia o ícone de
  // imagem quebrada no canto) e fica o degradê. O erro pode ter acontecido ANTES
  // da hidratação, quando o `onError` ainda não existia; o efeito confere.
  useEffect(() => {
    const el = imagem.current;
    if (el?.complete && el.naturalWidth === 0) setFalhou(true);
  }, []);

  return (
    <div
      data-theme="dark"
      data-testid="imagem-do-acesso"
      className="relative order-first h-24 shrink-0 overflow-hidden rounded-b-3xl bg-background lg:h-auto lg:min-h-0 lg:flex-[1.15] lg:rounded-3xl"
    >
      <div aria-hidden className="absolute inset-0 bg-(image:--pele-grad-soft)" />
      <picture>
        <source media={BREAKPOINT_DO_PAINEL} srcSet={`${retrato.base}.avif`} type="image/avif" />
        <source media={BREAKPOINT_DO_PAINEL} srcSet={`${retrato.base}.webp`} type="image/webp" />
        <source media={BREAKPOINT_DO_PAINEL} srcSet={`${retrato.base}.jpg`} type="image/jpeg" />
        <source srcSet={`${faixa.base}.avif`} type="image/avif" />
        <source srcSet={`${faixa.base}.webp`} type="image/webp" />
        <img
          {...props}
          ref={imagem}
          alt=""
          className={falhou ? "hidden" : props.className}
          onError={() => setFalhou(true)}
        />
      </picture>
      <div className="relative hidden p-14 lg:block">
        <div className="ml-auto w-[min(44%,340px)]">
          <p className="text-title-lg font-bold text-balance text-foreground lg:text-[28px] lg:leading-tight lg:tracking-tight">
            {t("Atendimento, funil e IA no mesmo lugar.")}
          </p>
          <p className="mt-3 text-message text-foreground/80">
            {t("Cada conversa vira uma oportunidade acompanhada.")}
          </p>
        </div>
      </div>
    </div>
  );
}
