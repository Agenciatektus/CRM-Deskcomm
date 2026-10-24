import { CTA, ETAPAS, HERO, PROBLEMAS, linkWhatsapp } from "@/lib/conteudo";

import { BotaoPrimario, BotaoSecundario } from "./Botao";
import { Conversa } from "./vitrines/Conversa";

export function Hero() {
  return (
    <section
      aria-labelledby="titulo-hero"
      className="mx-auto grid max-w-6xl gap-12 px-5 pt-14 pb-20 lg:grid-cols-[1.12fr_0.95fr] lg:items-center lg:gap-14 lg:pt-20 lg:pb-28 [&>*]:min-w-0"
    >
      <div>
        <p className="m-0 mb-5 flex items-center gap-3 font-mono text-[0.75rem] tracking-[0.14em] text-text-muted uppercase">
          <span aria-hidden="true" className="h-px w-8 bg-border-strong" />
          {HERO.eyebrow}
        </p>
        <h1
          id="titulo-hero"
          className="m-0 text-[clamp(2.1rem,4.2vw,3.25rem)] leading-[1.08] font-bold tracking-[-0.025em] text-balance"
        >
          {HERO.titulo}
        </h1>
        <p className="mt-6 mb-0 max-w-[34rem] text-[1.12rem] leading-relaxed text-text-muted">
          {HERO.texto}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <BotaoPrimario href={linkWhatsapp(CTA.mensagem)} externo>
            {CTA.rotulo}
          </BotaoPrimario>
          <BotaoSecundario href="#como-funciona">Ver como funciona</BotaoSecundario>
        </div>
        <p className="mt-5 mb-0 text-[0.9rem] text-text-subtle">{HERO.nota}</p>
      </div>
      <Conversa />
    </section>
  );
}

export function Problema() {
  return (
    <section aria-labelledby="titulo-problema" className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-28 [&>*]:min-w-0">
        <h2
          id="titulo-problema"
          className="m-0 max-w-[16ch] text-[clamp(1.75rem,3vw,2.6rem)] leading-tight font-bold tracking-tight text-balance lg:sticky lg:top-28 lg:self-start"
        >
          Onde a venda se perde antes de chegar ao caixa.
        </h2>
        <ul className="m-0 flex list-none flex-col gap-10 p-0">
          {PROBLEMAS.map((p) => (
            <li key={p.titulo} className="border-t border-border-strong pt-5">
              <h3 className="m-0 text-[1.2rem] leading-snug font-semibold">{p.titulo}</h3>
              <p className="mt-2.5 mb-0 max-w-[38rem] leading-relaxed text-text-muted">{p.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="titulo-como"
      className="scroll-mt-16 border-t border-border"
    >
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <h2
          id="titulo-como"
          className="m-0 max-w-[24ch] text-[clamp(1.75rem,3vw,2.6rem)] leading-tight font-bold tracking-tight text-balance"
        >
          A vida de um lead dentro do Verdash CRM.
        </h2>

        <figure className="mx-0 mt-10 mb-12">
          <picture>
            <source srcSet="/_lp/img/fluxo.avif" type="image/avif" />
            <source srcSet="/_lp/img/fluxo.webp" type="image/webp" />
            <img
              src="/_lp/img/fluxo.jpg"
              width={1920}
              height={1080}
              loading="lazy"
              decoding="async"
              alt="Conversas do WhatsApp e do Instagram entram em um funil de cartões e avançam por quatro etapas, até o negócio ser marcado como fechado."
              className="rounded-modal h-auto w-full border border-border"
            />
          </picture>
          <figcaption className="mt-3 text-[0.8rem] text-text-subtle">
            Ilustração do caminho de um lead, do primeiro contato ao fechamento.
          </figcaption>
        </figure>

        <ol className="m-0 grid list-none gap-x-6 gap-y-9 p-0 sm:grid-cols-2 lg:grid-cols-5 [&>*]:min-w-0">
          {ETAPAS.map((e, i) => (
            <li key={e.titulo} className="border-t border-border-strong pt-4">
              <span className="font-mono text-[0.75rem] tracking-widest text-text-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="m-0 mt-2 text-[1.05rem] leading-snug font-semibold">{e.titulo}</h3>
              <p className="mt-2 mb-0 text-[0.92rem] leading-relaxed text-text-muted">{e.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
