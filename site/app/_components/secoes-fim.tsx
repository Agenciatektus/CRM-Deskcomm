import { CTA, CTA_FINAL, FAQ, GOOGLE, SITE, linkWhatsapp } from "@/lib/conteudo";

import { BotaoPrimario } from "./Botao";
import { Logotipo } from "./Marca";

export function Faq() {
  return (
    <section id="faq" aria-labelledby="titulo-faq" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20 lg:py-28 [&>*]:min-w-0">
        <h2
          id="titulo-faq"
          className="m-0 max-w-[12ch] text-[clamp(1.75rem,3vw,2.6rem)] leading-tight font-bold tracking-tight text-balance"
        >
          Perguntas que aparecem antes de contratar.
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map((f) => (
            <details key={f.p} className="group py-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[1.05rem] font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                {f.p}
                <span
                  aria-hidden="true"
                  className="font-mono text-[1.2rem] text-text-subtle transition-transform duration-150 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-0 mb-4 max-w-[40rem] leading-relaxed text-text-muted">{f.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaFinal() {
  return (
    <section aria-labelledby="titulo-cta" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <div className="rounded-modal border border-border-strong bg-surface p-8 sm:p-12">
          <h2
            id="titulo-cta"
            className="m-0 max-w-[22ch] text-[clamp(1.75rem,3.2vw,2.8rem)] leading-tight font-bold tracking-tight text-balance"
          >
            {CTA_FINAL.titulo}
          </h2>
          <p className="mt-4 mb-0 max-w-[36rem] leading-relaxed text-text-muted">
            {CTA_FINAL.texto}
          </p>
          <div className="mt-8">
            <BotaoPrimario href={linkWhatsapp(CTA.mensagem)} externo>
              {CTA.rotulo} pelo WhatsApp
            </BotaoPrimario>
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
              Implantado e acompanhado pela Tektus.
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
            href={linkWhatsapp(CTA.mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center text-text underline underline-offset-2"
          >
            WhatsApp da Tektus
          </a>
        </nav>
        <p className="mt-6 mb-0 text-[0.8rem] leading-relaxed text-text-subtle">
          Baseado no DeskcommCRM, projeto de código aberto (licença MIT). Página atualizada em
          24/10/2026. {SITE.nome} é implantado pela Tektus.
        </p>
      </div>
    </footer>
  );
}
