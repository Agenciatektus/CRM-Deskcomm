/** As amostras de cor da vitrine. As classes vão LITERAIS: o scanner do Tailwind só gera o que lê no código. */
import type { IdDoMapa } from "@/lib/design-system/mapa";

export type ItemDeCor = { token: string; classe: string; mapa: IdDoMapa };

export const SUPERFICIES: ItemDeCor[] = [
  { token: "--color-bg", classe: "bg-bg", mapa: "cor:bg" },
  { token: "--color-surface", classe: "bg-surface", mapa: "cor:surface" },
  { token: "--color-surface-elevated", classe: "bg-surface-elevated", mapa: "cor:surface-elevated" },
  { token: "--color-thread", classe: "bg-thread", mapa: "cor:thread" },
  { token: "--color-hover", classe: "bg-hover", mapa: "cor:hover" },
  { token: "--color-tint", classe: "bg-tint", mapa: "cor:tint" },
];
export const TINTAS: ItemDeCor[] = [
  { token: "--color-text", classe: "bg-text", mapa: "cor:text" },
  { token: "--color-text-muted", classe: "bg-text-muted", mapa: "cor:text-muted" },
  { token: "--color-text-subtle", classe: "bg-text-subtle", mapa: "cor:text-subtle" },
  { token: "--color-border", classe: "bg-border", mapa: "cor:border" },
  { token: "--color-border-strong", classe: "bg-border-strong", mapa: "cor:border-strong" },
];
export const MARCA: ItemDeCor[] = [
  { token: "--color-accent", classe: "bg-accent", mapa: "cor:accent" },
  { token: "--color-accent-hover", classe: "bg-accent-hover", mapa: "cor:accent-hover" },
  { token: "--color-accent-fg", classe: "bg-accent-foreground", mapa: "cor:accent-fg" },
  { token: "--color-accent-soft", classe: "bg-accent-soft", mapa: "cor:accent-soft" },
  { token: "--color-accent-soft-2", classe: "bg-accent-soft-2", mapa: "cor:accent-soft-2" },
  { token: "--color-accent-text", classe: "bg-accent-text", mapa: "cor:accent-text" },
];
export const ESTADOS: ItemDeCor[] = [
  { token: "--color-success-bg", classe: "bg-success-bg", mapa: "cor:success-bg" },
  { token: "--color-success-fg", classe: "bg-success-fg", mapa: "cor:success-fg" },
  { token: "--color-warning-bg", classe: "bg-warning-bg", mapa: "cor:warning-bg" },
  { token: "--color-warning-fg", classe: "bg-warning-fg", mapa: "cor:warning-fg" },
  { token: "--color-warning-line", classe: "bg-warning-line", mapa: "cor:warning-line" },
  { token: "--color-error-bg", classe: "bg-error-bg", mapa: "cor:error-bg" },
  { token: "--color-error-fg", classe: "bg-error-fg", mapa: "cor:error-fg" },
  { token: "--color-info-bg", classe: "bg-info-bg", mapa: "cor:info-bg" },
  { token: "--color-info-fg", classe: "bg-info-fg", mapa: "cor:info-fg" },
];
export const AVATARES: ItemDeCor[] = [
  { token: "--color-avatar-1", classe: "bg-avatar-1", mapa: "cor:avatar" },
  { token: "--color-avatar-2", classe: "bg-avatar-2", mapa: "cor:avatar" },
  { token: "--color-avatar-3", classe: "bg-avatar-3", mapa: "cor:avatar" },
  { token: "--color-avatar-4", classe: "bg-avatar-4", mapa: "cor:avatar" },
  { token: "--color-avatar-5", classe: "bg-avatar-5", mapa: "cor:avatar" },
  { token: "--color-avatar-6", classe: "bg-avatar-6", mapa: "cor:avatar" },
];
export const PELE: ItemDeCor[] = [
  { token: "--pele-grad", classe: "bg-(image:--pele-grad)", mapa: "cor:pele-grad" },
  { token: "--pele-grad-texto", classe: "bg-(image:--pele-grad-texto)", mapa: "cor:pele-grad-texto" },
  { token: "--pele-foco", classe: "bg-(--pele-foco)", mapa: "cor:pele-foco" },
];

// Os pares de texto que as telas mais usam, medidos no fundo em que aparecem.
export const PARES: { nome: string; classe: string }[] = [
  { nome: "text / surface", classe: "bg-surface text-text" },
  { nome: "text-muted / surface", classe: "bg-surface text-text-muted" },
  { nome: "text-subtle / surface", classe: "bg-surface text-text-subtle" },
  { nome: "text-subtle / bg", classe: "bg-bg text-text-subtle" },
  { nome: "accent-fg / accent", classe: "bg-accent text-accent-foreground" },
  { nome: "accent-text / surface", classe: "bg-surface text-accent-text" },
  { nome: "accent-text / accent-soft", classe: "bg-accent-soft text-accent-text" },
  { nome: "success-fg / success-bg", classe: "bg-success-bg text-success-fg" },
  { nome: "warning-fg / warning-bg", classe: "bg-warning-bg text-warning-fg" },
  { nome: "error-fg / error-bg", classe: "bg-error-bg text-error-fg" },
  { nome: "info-fg / info-bg", classe: "bg-info-bg text-info-fg" },
];

