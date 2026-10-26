import type { ReactNode } from "react";

import { Icone } from "./Icones";

/**
 * Peças pequenas das telas de exemplo, com as classes e os valores do CRM (tema escuro): avatar,
 * ícone de canal, pílula de estado (`rounded-pill`, 6 px, a mesma do Badge do produto), etiqueta
 * (`rounded-full`), rótulo mono. Tudo é MARCAÇÃO de demonstração com dados fictícios.
 */

/** Avatares do CRM (tokens avatar-1 a 6, escuro): fundo e texto. */
const TONS = [
  ["#5d2d2a", "#fed2cd"],
  ["#4f3815", "#f3dab2"],
  ["#194430", "#c2e9d3"],
  ["#1c4159", "#c4e4f4"],
  ["#43345c", "#e3d7fb"],
  ["#134245", "#c0e7e8"],
] as const;

export function Avatar({ nome, tom = 0, tamanho = "size-9" }: { nome: string; tom?: number; tamanho?: string }) {
  const [fundo, texto] = TONS[tom % TONS.length] ?? TONS[0];
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`grid ${tamanho} shrink-0 place-items-center rounded-full font-semibold ${
        /size-[3-6]|size-\[/.test(tamanho) ? "text-[10px] font-bold" : /size-[78]/.test(tamanho) ? "text-[11px]" : "text-[13px]"
      }`}
      style={{ background: fundo, color: texto }}
    >
      {iniciais}
    </span>
  );
}

/** Selo redondo do canal sobre o avatar, como na lista de conversas. */
export function SeloDeCanal({ canal, tamanho = "size-[18px]" }: { canal: "whatsapp" | "instagram"; tamanho?: string }) {
  const wa = canal === "whatsapp";
  return (
    <span
      className={`absolute -right-[3px] -bottom-[3px] grid ${tamanho} place-items-center rounded-full text-white ring-2 ring-surface ${
        wa ? "bg-[oklch(0.62_0.15_150)]" : "bg-[oklch(0.58_0.2_0)]"
      }`}
    >
      <Icone nome={wa ? "chat" : "camera"} peso="bold" className="size-[11px]" />
    </span>
  );
}

/** Chip de canal com texto (cartões e cabeçalhos). */
export function CanalChip({ canal }: { canal: "whatsapp" | "instagram" }) {
  const wa = canal === "whatsapp";
  return (
    <span className="inline-flex items-center gap-1 text-meta text-text-muted">
      <span className={`grid size-3.5 place-items-center rounded-full text-white ${wa ? "bg-[oklch(0.62_0.15_150)]" : "bg-[oklch(0.58_0.2_0)]"}`}>
        <Icone nome={wa ? "chat" : "camera"} peso="bold" className="size-2" />
      </span>
      {wa ? "WhatsApp" : "Instagram"}
    </span>
  );
}

/** Pílula de estado do CRM: `h-5.5 rounded-pill border px-2 text-meta font-semibold`. */
export function Selo({
  tom = "neutro",
  children,
}: {
  tom?: "neutro" | "ia" | "ok" | "aviso" | "crit" | "info" | "pessoa" | "semdono";
  children: ReactNode;
}) {
  const estilos = {
    neutro: "border-border bg-surface-elevated text-text-muted",
    ia: "border-transparent bg-accent-soft text-accent-text",
    ok: "border-transparent bg-success-bg text-success-fg",
    aviso: "border-transparent bg-warning-bg text-warning-fg",
    crit: "border-transparent bg-error-bg text-error-fg",
    info: "border-transparent bg-info-bg text-info-fg",
    pessoa: "border-border bg-surface text-text-muted",
    semdono: "border-dashed border-border-strong bg-transparent text-text-muted",
  } as const;
  return (
    <span
      className={`inline-flex h-[1.375rem] shrink-0 items-center gap-1 rounded-pill border px-2 text-meta font-semibold whitespace-nowrap ${estilos[tom]}`}
    >
      {children}
    </span>
  );
}

/** Etiqueta (tag) do contato: redonda, fio claro, texto normal. */
export function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[1.375rem] items-center rounded-full border border-border bg-surface px-2 text-xs leading-5 whitespace-nowrap text-text-muted">
      {children}
    </span>
  );
}

/** Botão do app (somente aparência): primário com o degradê, ou contornado. */
export function BotaoApp({
  children,
  variante = "primario",
}: {
  children: ReactNode;
  variante?: "primario" | "contorno" | "fantasma";
}) {
  const estilos = {
    primario: "bg-(image:--degrade) text-white shadow-[0_2px_0_rgb(0_0_0/0.25)]",
    contorno: "border border-border-strong bg-transparent text-text",
    fantasma: "text-text-muted",
  } as const;
  return (
    <span
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-control px-3.5 text-[13px] font-semibold whitespace-nowrap ${estilos[variante]}`}
    >
      {children}
    </span>
  );
}

/** Rótulo mono em caixa alta, o mesmo das legendas da interface. */
export function Rotulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`m-0 font-mono text-[0.7rem] tracking-[0.12em] text-text-subtle uppercase ${className}`}>{children}</p>
  );
}
