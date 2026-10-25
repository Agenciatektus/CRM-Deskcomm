import { CTA, CTA_FINAL, FAQ, GOOGLE, SITE, linkWhatsapp } from "@/lib/conteudo";

import { BotaoPrimario, BotaoSecundario } from "./Botao";
import { Secao } from "./Secao";
import { Logotipo } from "./Marca";

export function Faq() {
  return (
    <Secao id="faq" titulo="titulo-faq" fundo="faixa">
      <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20 [&>*]:min-w-0">
        <div className="revela lg:sticky lg:top-24 lg:self-start">
          <h2
            id="titulo-faq"
            className="m-0 max-w-[12ch] text-[clamp(1.85rem,3.4vw,2.9rem)] leading-[1.1] font-bold tracking-tight text-balance"
          >
            Perguntas que aparecem antes de contratar.
          </h2>
          <p className="mt-4 mb-0 max-w-[22rem] leading-relaxed text-text-muted">
            Não achou a sua? Pergunte pelo WhatsApp e a Tektus responde.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {FAQ.map((f, i) => (
            <details
              key={f.p}
              className="card revela group px-5 py-1 open:border-border-strong"
              style={{ "--atraso": `${i * 0.05}s` } as React.CSSProperties}
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[1.05rem] font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                {f.p}
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full border border-border-strong font-mono text-[1.1rem] text-text-subtle transition-transform duration-150 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-0 mb-4 max-w-[40rem] leading-relaxed text-text-muted">{f.r}</p>
            </details>
          ))}
        </div>
      </div>
    </Secao>
  );
}

export function CtaFinal() {
  return (
    <section aria-labelledby="titulo-cta" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 fundo-brilho-azul" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 fundo-brilho-menta" />
      <div className="mx-auto max-w-6xl px-5 py-24 lg:py-32">
        <div className="borda-luz janela-app revela relative overflow-hidden rounded-[22px] bg-surface p-8 sm:p-14">
          <picture aria-hidden="true">
            <source srcSet="/_lp/img/fluxo.avif" type="image/avif" />
            <source srcSet="/_lp/img/fluxo.webp" type="image/webp" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/_lp/img/fluxo.jpg"
              alt=""
              width={1600}
              height={900}
              loading="lazy"
              decoding="async"
              className="pointer-events-none absolute inset-0 size-full object-cover opacity-70 mix-blend-screen"
            />
          </picture>
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-surface from-25% via-surface/55 to-transparent" />
          <div className="relative">
            <h2
              id="titulo-cta"
              className="m-0 max-w-[20ch] text-[clamp(1.9rem,3.6vw,3.1rem)] leading-[1.08] font-bold tracking-tight text-balance"
            >
              {CTA_FINAL.titulo}
            </h2>
            <p className="mt-4 mb-0 max-w-[36rem] text-[1.05rem] leading-relaxed text-text-muted">
              {CTA_FINAL.texto}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <BotaoPrimario href="#oferta">
                {CTA.comprar.rotulo}
              </BotaoPrimario>
              <BotaoSecundario href={linkWhatsapp(CTA.duvida.mensagem)}>{CTA.duvida.rotulo}</BotaoSecundario>
            </div>
            <p className="mt-6 mb-0 text-[1.1rem] font-bold">{CTA_FINAL.assinatura}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Rodape() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
          <div>
            <Logotipo />
            <p className="mt-4 mb-0 max-w-[26rem] text-[0.9rem] leading-relaxed text-text-muted">
              CRM com agentes de inteligência artificial para negócios que vendem pelo WhatsApp.
              Implantação opcional pela Tektus.
            </p>
          </div>
          <div>
            <h2 className="m-0 font-mono text-[0.75rem] font-medium tracking-wider text-text-muted uppercase">
              {GOOGLE.titulo}
            </h2>
            <p className="mt-3 mb-0 max-w-[40rem] text-[0.9rem] leading-relaxed text-text-muted">
              {GOOGLE.texto}{" "}
              <a
                href="/legal/privacy#dados-do-google"
                className="text-link underline underline-offset-2"
              >
                Política de Privacidade
              </a>
              .
            </p>
          </div>
        </div>
        <nav
          aria-label="Rodapé"
          className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-[0.9rem]"
        >
          <a
            href="/legal/privacy"
            className="inline-flex min-h-8 items-center text-text underline underline-offset-2"
          >
            Política de Privacidade
          </a>
          <a
            href="/legal/terms"
            className="inline-flex min-h-8 items-center text-text underline underline-offset-2"
          >
            Termos de Uso
          </a>
          <a
            href="/login"
            className="inline-flex min-h-8 items-center text-text underline underline-offset-2"
          >
            Entrar
          </a>
          <a
            href={linkWhatsapp(CTA.duvida.mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center text-text underline underline-offset-2"
          >
            WhatsApp da Tektus
          </a>
        </nav>
        <p className="mt-6 mb-0 text-[0.8rem] leading-relaxed text-text-subtle">
          Baseado no DeskcommCRM, projeto de código aberto (licença MIT). Página atualizada em
          25/10/2026. {SITE.nome} tem implantação opcional pela Tektus.
        </p>
      </div>
    </footer>
  );
}
