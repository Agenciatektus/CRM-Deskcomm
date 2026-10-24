import { CTA, HERO, linkWhatsapp } from "@/lib/conteudo";

import { BotaoPrimario, BotaoSecundario } from "./Botao";
import { TelaInbox } from "./telas/TelaInbox";
import { Icone } from "./ui/Icones";
import { Avatar, Selo } from "./ui/Pecas";
import { Janela } from "./ui/Janela";

/**
 * O hero: promessa grande em cima e, embaixo, o próprio sistema. A janela da Inbox sobe com
 * perspectiva e esmaece na base (o app continua "para baixo da dobra"). Em volta, três cards de
 * componentes reais (etapa do funil, agente com teto de gasto, Radar) flutuam sobre a janela.
 * Fundo em camadas: grade, brilhos de marca e ruído, mais a arte do fluxo bem ao fundo.
 */
export function Hero() {
  return (
    <section aria-labelledby="titulo-hero" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="fundo-brilho-azul absolute inset-0" />
        <div className="fundo-brilho-menta absolute inset-0" />
        <div className="fundo-grade absolute inset-0" />
        <picture>
          <source srcSet="/_lp/img/fluxo.avif" type="image/avif" />
          <img
            src="/_lp/img/fluxo.jpg"
            alt=""
            width={1920}
            height={1080}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="absolute -top-10 left-1/2 w-[135%] max-w-none -translate-x-1/2 opacity-[0.22] mix-blend-screen [mask-image:radial-gradient(ellipse_55%_50%_at_50%_30%,#000_25%,transparent_72%)] md:w-[110%]"
          />
        </picture>
        <div className="fundo-ruido absolute inset-0 opacity-60" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
      </div>

      <div className="mx-auto max-w-6xl px-5 pt-10 text-center sm:pt-14">
        <p className="a-sobe m-0 mb-6 inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface/70 py-1.5 pr-4 pl-3 font-mono text-[0.72rem] tracking-[0.12em] text-text-muted uppercase backdrop-blur-sm">
          <span aria-hidden="true" className="a-pulso size-1.5 rounded-full bg-menta shadow-[0_0_10px_2px_rgb(43_200_143/0.7)]" />
          {HERO.eyebrow}
        </p>

        <h1
          id="titulo-hero"
          className="a-sobe mx-auto m-0 max-w-[26ch] text-[clamp(2.1rem,4.6vw,3.9rem)] font-bold leading-[1.04] tracking-[-0.03em] text-balance [--atraso:0.08s]"
        >
          Todo lead que chama no WhatsApp ganha{" "}
          <span className="relative whitespace-nowrap">
            dono, resposta
            <svg
              aria-hidden="true"
              viewBox="0 0 300 12"
              preserveAspectRatio="none"
              className="absolute inset-x-0 -bottom-1 h-2.5 w-full"
            >
              <path d="M2 8 C 70 2, 150 11, 298 3" fill="none" stroke="url(#traco)" strokeWidth="3" strokeLinecap="round" />
              <defs>
                <linearGradient id="traco" x1="0" x2="1">
                  <stop offset="0" stopColor="#2a52d8" />
                  <stop offset="1" stopColor="#2bc88f" />
                </linearGradient>
              </defs>
            </svg>
          </span>{" "}
          e próximo passo.
        </h1>

        <p className="a-sobe mx-auto mb-0 mt-5 max-w-[40rem] text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-text-muted [--atraso:0.18s]">
          {HERO.texto}
        </p>

        <div className="a-sobe mt-7 flex flex-wrap items-center justify-center gap-3 [--atraso:0.28s]">
          <BotaoPrimario href={linkWhatsapp(CTA.mensagem)} externo>
            {CTA.rotulo}
          </BotaoPrimario>
          <BotaoSecundario href="#como-funciona">Ver o sistema em ação</BotaoSecundario>
        </div>
        <p className="a-sobe mb-0 mt-5 text-[0.9rem] text-text-subtle [--atraso:0.36s]">{HERO.nota}</p>
      </div>

      {/* A janela do app, com os cards flutuando por cima. */}
      <div className="relative mx-auto mt-10 max-w-[72rem] px-4 sm:mt-12 sm:px-6">
        <div className="[perspective:2000px]">
          <div className="a-ergue origin-top">
            <Janela rota="inbox">
              <TelaInbox />
            </Janela>
          </div>
        </div>

        {/* Esmaece a base: o sistema continua abaixo da dobra. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-b from-transparent via-bg/75 to-bg"
        />

        {/* Card: o negócio muda de etapa */}
        <div
          className="a-entra a-flutua absolute -left-9 top-[44%] z-20 hidden w-60 rounded-modal border border-border-strong bg-surface-elevated/95 p-3.5 shadow-[0_24px_50px_-18px_rgb(0_0_0/0.9)] backdrop-blur-md xl:block [--atraso:2s]"
          aria-hidden="true"
        >
          <p className="m-0 mb-2 flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider text-text-subtle uppercase">
            <Icone nome="funil" className="size-3" /> Funil · Clínica de estética
          </p>
          <div className="flex items-center gap-2 text-meta">
            <Selo tom="aviso">Qualificando</Selo>
            <Icone nome="seta" className="size-3.5 text-text-subtle" />
            <Selo tom="ok">Agendado</Selo>
          </div>
          <div className="mt-2.5 flex items-center gap-2 rounded-card border border-border bg-bg/70 px-2.5 py-2">
            <Avatar nome="Marina Duarte" tom={2} tamanho="size-6" />
            <span className="text-meta font-semibold">Marina D.</span>
            <span className="ml-auto text-[0.68rem] text-text-subtle">amanhã, 16h</span>
          </div>
        </div>

        {/* Card: o agente, com rédea */}
        <div
          className="a-entra a-flutua absolute -right-5 -top-8 z-20 hidden w-64 rounded-modal border border-border-strong bg-surface-elevated/95 p-3.5 shadow-[0_24px_50px_-18px_rgb(0_0_0/0.9)] backdrop-blur-md xl:block [--atraso:2.4s]"
          aria-hidden="true"
        >
          <p className="m-0 mb-2.5 flex items-center justify-between font-mono text-[0.65rem] tracking-wider text-text-subtle uppercase">
            <span className="flex items-center gap-1.5">
              <Icone nome="agente" className="size-3" /> Agente de IA
            </span>
            <Selo tom="ok">ativo</Selo>
          </p>
          <p className="m-0 text-meta text-text-muted">Teto de gasto do mês</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="a-enche h-full w-[38%] rounded-full bg-(image:--degrade) [--atraso:2.8s]" />
          </div>
          <p className="m-0 mt-2 flex items-center gap-1.5 text-meta text-text-muted">
            <Icone nome="escudo" className="size-3.5 text-ok" /> Passa para uma pessoa quando precisa
          </p>
        </div>

        {/* Card: o Radar */}
        <div
          className="a-entra a-flutua absolute -right-6 bottom-24 z-20 hidden w-60 rounded-modal border border-border-strong bg-surface-elevated/95 p-3.5 shadow-[0_24px_50px_-18px_rgb(0_0_0/0.9)] backdrop-blur-md xl:block [--atraso:2.8s]"
          aria-hidden="true"
        >
          <p className="m-0 mb-2 flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider text-text-subtle uppercase">
            <Icone nome="radar" className="size-3" /> Radar
          </p>
          <div className="flex items-start gap-2.5">
            <Avatar nome="Tiago Moreira" tom={5} tamanho="size-7" />
            <div className="min-w-0">
              <p className="m-0 text-meta font-semibold">Tiago M.</p>
              <p className="m-0 text-[0.72rem] text-warn">Sem resposta há 2 h</p>
              <p className="m-0 mt-1 flex items-center gap-1 text-[0.7rem] text-text-muted">
                <Icone nome="relogio" className="size-3" /> Follow-up às 16h
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
