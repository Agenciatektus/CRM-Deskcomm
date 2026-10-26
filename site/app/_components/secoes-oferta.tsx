import { CTA, GARANTIA, GARANTIA_CONFIRMADA, OBJECOES, OFERTA, PARA_QUEM, linkWhatsapp } from "@/lib/conteudo";

import { BotaoSecundario } from "./Botao";
import { Planos } from "./Planos";
import { Card, Cabeca, Secao } from "./Secao";
import { Icone } from "./ui/Icones";
import { ImagemDeSlot } from "./ui/ImagemDeSlot";

/** Oferta: seletor de período, os dois planos em comparativo, a implantação opcional e a dúvida. */
export function Oferta() {
  return (
    <Secao id="oferta" titulo="titulo-oferta" fundo="grade" largura="grade" ritmo="l">
      <Cabeca id="titulo-oferta" titulo={OFERTA.titulo} />
      <Planos />
      <div className="revela mt-8 flex flex-wrap items-center gap-3">
        <BotaoSecundario href={linkWhatsapp(CTA.duvida.mensagem)}>
          {CTA.duvida.rotulo}
        </BotaoSecundario>
      </div>
    </Secao>
  );
}

/** Só renderiza com `GARANTIA_CONFIRMADA`. */
export function Garantia() {
  if (!GARANTIA_CONFIRMADA) return null;
  return (
    <Secao titulo="titulo-garantia" fundo="menta" largura="texto" ritmo="m">
      <div className="luz luz-menta luz-fraca rounded-modal [--luz-blur:80px]">
        <ImagemDeSlot
          id="garantia-anel"
          opacidade={0.75}
          fallback="fundo-brilho-menta"
          className="top-1/2 left-1/2 -z-10 size-[58rem] max-w-none -translate-x-1/2 -translate-y-1/2"
          mascara="[mask-image:radial-gradient(circle_closest-side,#000_88%,transparent_100%)]"
        />
        <div className="card borda-luz revela rounded-modal p-8 sm:p-10 lg:p-14">
          <div className="grid items-center gap-6 md:grid-cols-[auto_1fr] md:gap-8">
            <Selo100 />
            <div>
              <h2 id="titulo-garantia" className="m-0 text-[clamp(1.6rem,3vw,2.4rem)] leading-tight font-bold tracking-tight">
                {GARANTIA.titulo}
              </h2>
              <p className="mt-3 mb-0 text-[1.1rem] leading-relaxed">{GARANTIA.texto}</p>
            </div>
          </div>

          <h3 className="m-0 mt-10 mb-4 text-base font-bold">{GARANTIA.marcosTitulo}</h3>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-5">
            {GARANTIA.marcos.map((m) => (
              <li
                key={m.texto}
                className="flex flex-col items-start gap-2 rounded-card border border-border bg-bg/60 p-4 text-[0.95rem] font-semibold"
              >
                <Icone nome={m.icone} className="size-7 text-link" />
                {m.texto}
              </li>
            ))}
          </ul>

          <p className="mt-8 mb-0 flex items-start gap-3 rounded-card bg-info-bg/40 p-4 leading-relaxed text-text-muted">
            <Icone nome="alerta" className="mt-0.5 size-5 shrink-0 text-info-fg" />
            <span>{GARANTIA.limite}</span>
          </p>
        </div>
      </div>
    </Secao>
  );
}

/** Selo da garantia: anel duplo em SVG, escudo no centro e o "100%" em HTML por cima (sem texto no SVG). */
function Selo100() {
  return (
    <div className="relative size-[120px] shrink-0" aria-hidden="true">
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" fill="none">
        <defs>
          <linearGradient id="selo-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#2a52d8" />
            <stop offset="1" stopColor="#2bc88f" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="56" stroke="var(--color-border-strong)" strokeWidth="2" />
        <circle cx="60" cy="60" r="48" stroke="url(#selo-grad)" strokeWidth="4" strokeLinecap="round" pathLength="1" className="selo-anel" />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <Icone nome="escudo" className="size-8 text-ok" />
        <span className="text-[1.25rem] leading-none font-bold">100%</span>
      </span>
    </div>
  );
}

export function ParaQuem() {
  return (
    <Secao titulo="titulo-para-quem" fundo="pontos">
      <Cabeca id="titulo-para-quem" titulo={PARA_QUEM.titulo} />
      <div className="grid gap-6 lg:gap-8 md:grid-cols-2 [&>*]:min-w-0">
        {[PARA_QUEM.serve, PARA_QUEM.naoServe].map((b, i) => (
          <Card key={b.titulo} atraso={i * 0.1}>
            <h3 className="m-0 text-[1.15rem] font-bold">{b.titulo}</h3>
            <p className="mt-2 mb-0 leading-relaxed text-text-muted">{b.texto}</p>
          </Card>
        ))}
      </div>
    </Secao>
  );
}

export function Objecoes() {
  return (
    <Secao titulo="titulo-objecoes" fundo="azul">
      <Cabeca id="titulo-objecoes" titulo="O que costuma passar pela cabeça antes de comprar" />
      {/* Acordeão nativo (details/summary): sem cartão, sem JavaScript, duas colunas no desktop. */}
      <div className="grid items-start gap-x-12 md:grid-cols-2 [&>*]:min-w-0">
        {OBJECOES.map((o) => (
          <details key={o.p} className="group revela border-b border-border py-1">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-controle py-3 text-[1.05rem] leading-snug font-bold marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
              {o.p}
              <Icone nome="chevron" peso="bold" className="size-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-90" />
            </summary>
            <p className="mt-0 mb-4 leading-relaxed text-text-muted">{o.r}</p>
          </details>
        ))}
      </div>
    </Secao>
  );
}
