import { CTA, HERO, VIDEO, PROVA } from "@/lib/conteudo";

import { BotaoPrimario, BotaoSecundario } from "./Botao";
import { Container } from "./Secao";
import { TelaInbox } from "./telas/TelaInbox";
import { Icone } from "./ui/Icones";
import { ImagemDeSlot } from "./ui/ImagemDeSlot";
import { Avatar, Selo } from "./ui/Pecas";
import { Janela } from "./ui/Janela";

/**
 * O hero: promessa grande em cima e, embaixo, o próprio sistema. A janela da Inbox sobe com
 * perspectiva e esmaece na base (o app continua "para baixo da dobra"). Em volta, três cards de
 * componentes reais (etapa do funil, agente com teto de gasto, Radar) flutuam sobre a janela.
 * Fundo em camadas: grade, brilhos de marca e ruído, mais a imagem hero-fluxo (IMG-01) ao fundo, sob máscara.
 */
export function Hero() {
  return (
    <section aria-labelledby="titulo-hero" className="relative isolate overflow-x-clip pb-(--espaco-secao-m)">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_88%,transparent)]"
      >
        <div className="fundo-brilho-azul absolute inset-0" />
        <div className="fundo-brilho-menta absolute inset-0" />
        <div className="fundo-grade absolute inset-0" />
        <ImagemDeSlot
          id="hero-fluxo"
          prioridade
          opacidade={0.6}
          className="inset-0"
          imgClassName="size-full object-cover object-top"
          mascara="[mask-image:radial-gradient(ellipse_85%_80%_at_50%_35%,#000_35%,transparent_100%)]"
        />
        <div className="fundo-ruido absolute inset-0 opacity-60" />
      </div>

      <Container largura="texto" className="pt-10 text-center sm:pt-14">
        <p className="a-sobe m-0 mb-6 inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface py-1.5 pr-4 pl-3 text-label font-semibold text-text-muted">
          <span aria-hidden="true" className="a-pulso size-1.5 rounded-full bg-menta shadow-[0_0_10px_2px_rgb(43_200_143/0.7)]" />
          {HERO.eyebrow}
        </p>

        <h1
          id="titulo-hero"
          className="a-sobe mx-auto m-0 max-w-[26ch] text-[clamp(2.1rem,4.6vw,3.9rem)] font-bold leading-[1.04] tracking-[-0.03em] text-balance [--atraso:0.08s]"
        >
          {HERO.abertura}{" "}
          <span className="relative whitespace-nowrap">
            {HERO.destaque}
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
          </span>
        </h1>

        <p className="a-sobe mx-auto mb-0 mt-5 max-w-[40rem] text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-text-muted [--atraso:0.18s]">
          {HERO.texto}
        </p>

        <div className="a-sobe mt-7 flex flex-wrap items-center justify-center gap-3 [--atraso:0.28s]">
          <BotaoPrimario href="#oferta">
            {CTA.comprar.rotulo}
          </BotaoPrimario>
          <BotaoSecundario href="#plantao">Ver o sistema em ação</BotaoSecundario>
        </div>
        <p className="sr-only">{HERO.preco}</p>
        <p className="a-sobe m-0 mt-6 text-[1rem] text-text-muted [--atraso:0.36s]">
          <span aria-hidden="true">{HERO.precoLinha}</span>{" "}
          <a
            href="#oferta"
            className="rounded-controle font-semibold text-link underline underline-offset-4 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-menta"
          >
            {HERO.precoLink}
          </a>
        </p>
        <p className="a-sobe mb-0 mt-2 text-[0.9rem] text-text-subtle [--atraso:0.4s]">{HERO.nota}</p>
      </Container>

      {/* A janela do app, com os cards flutuando por cima. */}
      <Container largura="tela" className="mt-10 sm:mt-12">
        <div className="relative">
          {/* A luz nasce atrás da janela, com o mesmo raio, e não é cortada (a seção só clipa o eixo X). */}
          <div className="luz a-respira rounded-modal [--luz-blur:80px] [--luz-inset:8%_4%_-6%_4%]">
            {/* O esmaecimento é máscara da própria janela: nada por cima dos chips. */}
            <div className="[mask-image:linear-gradient(to_bottom,#000_70%,transparent_100%)] [perspective:2000px]">
              <div className="a-ergue origin-top">
                <Janela rota="inbox">
                  <TelaInbox />
                </Janela>
              </div>
            </div>
          </div>

          {/* Chips: saem para fora da borda da janela, em linha, sem backdrop-blur. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[6%] -bottom-10 z-20 hidden items-end justify-between gap-6 xl:flex"
          >

        {/* Card: o negócio muda de etapa */}
        <div
          className="a-entra a-flutua w-60 rounded-grande border border-border-strong bg-surface-elevated p-3.5 shadow-(--shadow-e2) [--atraso:2s]"
        >
          <p className="m-0 mb-2 flex items-center gap-1.5 text-meta font-bold text-text-muted">
            <Icone nome="funil" className="size-3.5" /> Clínica de estética
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
          className="a-entra a-flutua w-64 rounded-grande border border-border-strong bg-surface-elevated p-3.5 shadow-(--shadow-e2) [--atraso:2.4s]"
        >
          <p className="m-0 mb-2.5 flex items-center justify-between text-meta font-bold text-text-muted">
            <span className="flex items-center gap-1.5">
              <Icone nome="agente" className="size-3.5" /> Agente IA
            </span>
            <Selo tom="ia">ativo</Selo>
          </p>
          <p className="m-0 text-meta text-text-muted">Teto de gasto do mês</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="a-enche h-full w-[38%] rounded-full bg-(image:--degrade) [--atraso:2.8s]" />
          </div>
          <p className="m-0 mt-2 flex items-center gap-1.5 text-meta text-text-muted">
            <Icone nome="escudo" className="size-3.5 text-success-fg" /> Passa para uma pessoa quando precisa
          </p>
        </div>

        {/* Card: o Radar */}
        <div
          className="a-entra a-flutua w-60 rounded-grande border border-border-strong bg-surface-elevated p-3.5 shadow-(--shadow-e2) [--atraso:2.8s]"
        >
          <p className="m-0 mb-2 flex items-center gap-1.5 text-meta font-bold text-text-muted">
            <Icone nome="radar" className="size-3.5" /> Radar
          </p>
          <div className="flex items-start gap-2.5">
            <Avatar nome="Tiago Moreira" tom={5} tamanho="size-7" />
            <div className="min-w-0">
              <p className="m-0 text-meta font-semibold">Tiago M.</p>
              <p className="m-0 text-xs font-semibold text-warning-fg">Esperando há 2 h</p>
              <p className="m-0 mt-1 flex items-center gap-1 text-[0.7rem] text-text-muted">
                <Icone nome="relogio" className="size-3" /> Follow-up às 16h
              </p>
            </div>
          </div>
        </div>
          </div>
        </div>

        {/* Legenda: bloco próprio, com espaço para os chips que saem da janela. Vira o player quando houver vídeo. */}
        <div className="mt-20 flex max-w-(--container-leitura) items-start gap-4">
          <svg aria-hidden="true" viewBox="0 0 256 256" className="mt-0.5 size-7 shrink-0 text-link" fill="currentColor" focusable="false">
            <circle cx="128" cy="128" r="96" opacity="0.2" />
            <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88Zm40-95.54-56-32A8 8 0 0 0 100 95.45v65.1a8 8 0 0 0 12 6.93l56-32.55a8 8 0 0 0 0-13.47Z" />
          </svg>
          <p className="m-0 text-[0.95rem] leading-relaxed text-text-muted">
            <span className="block text-base font-bold text-text">{PROVA.inbox.titulo}.</span> {VIDEO.legenda_sem_video}
          </p>
        </div>
      </Container>
    </section>
  );
}
