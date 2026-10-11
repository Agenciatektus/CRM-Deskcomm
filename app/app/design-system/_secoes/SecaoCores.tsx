"use client";

import { useT } from "@/hooks/i18n/useT";
import type { IdDoMapa } from "@/lib/design-system/mapa";

import { Amostra, ParDeContraste } from "../_componentes/Amostra";
import { RefDoPrototipo, SeloDoMapa } from "../_componentes/SeloDoMapa";
import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

type ItemDeCor = { token: string; classe: string; mapa: IdDoMapa };

// As classes vão LITERAIS: o scanner do Tailwind só gera o que lê no código.
const SUPERFICIES: ItemDeCor[] = [
  { token: "--color-bg", classe: "bg-bg", mapa: "cor:bg" },
  { token: "--color-surface", classe: "bg-surface", mapa: "cor:surface" },
  { token: "--color-surface-elevated", classe: "bg-surface-elevated", mapa: "cor:surface-elevated" },
  { token: "--color-thread", classe: "bg-thread", mapa: "cor:thread" },
  { token: "--color-hover", classe: "bg-hover", mapa: "cor:hover" },
  { token: "--color-tint", classe: "bg-tint", mapa: "cor:tint" },
];
const TINTAS: ItemDeCor[] = [
  { token: "--color-text", classe: "bg-text", mapa: "cor:text" },
  { token: "--color-text-muted", classe: "bg-text-muted", mapa: "cor:text-muted" },
  { token: "--color-text-subtle", classe: "bg-text-subtle", mapa: "cor:text-subtle" },
  { token: "--color-border", classe: "bg-border", mapa: "cor:border" },
  { token: "--color-border-strong", classe: "bg-border-strong", mapa: "cor:border-strong" },
];
const MARCA: ItemDeCor[] = [
  { token: "--color-accent", classe: "bg-accent", mapa: "cor:accent" },
  { token: "--color-accent-hover", classe: "bg-accent-hover", mapa: "cor:accent" },
  { token: "--color-accent-fg", classe: "bg-accent-foreground", mapa: "cor:accent-fg" },
  { token: "--color-accent-soft", classe: "bg-accent-soft", mapa: "cor:accent-soft" },
  { token: "--color-accent-soft-2", classe: "bg-accent-soft-2", mapa: "cor:accent-soft-2" },
  { token: "--color-accent-text", classe: "bg-accent-text", mapa: "cor:accent-text" },
];
const ESTADOS: ItemDeCor[] = [
  { token: "--color-success-bg", classe: "bg-success-bg", mapa: "cor:success" },
  { token: "--color-success-fg", classe: "bg-success-fg", mapa: "cor:success" },
  { token: "--color-warning-bg", classe: "bg-warning-bg", mapa: "cor:warning" },
  { token: "--color-warning-fg", classe: "bg-warning-fg", mapa: "cor:warning" },
  { token: "--color-warning-line", classe: "bg-warning-line", mapa: "cor:warning-line" },
  { token: "--color-error-bg", classe: "bg-error-bg", mapa: "cor:error" },
  { token: "--color-error-fg", classe: "bg-error-fg", mapa: "cor:error" },
  { token: "--color-info-bg", classe: "bg-info-bg", mapa: "cor:info" },
  { token: "--color-info-fg", classe: "bg-info-fg", mapa: "cor:info" },
];
const AVATARES: ItemDeCor[] = [
  { token: "--color-avatar-1", classe: "bg-avatar-1", mapa: "cor:avatar" },
  { token: "--color-avatar-2", classe: "bg-avatar-2", mapa: "cor:avatar" },
  { token: "--color-avatar-3", classe: "bg-avatar-3", mapa: "cor:avatar" },
  { token: "--color-avatar-4", classe: "bg-avatar-4", mapa: "cor:avatar" },
  { token: "--color-avatar-5", classe: "bg-avatar-5", mapa: "cor:avatar" },
  { token: "--color-avatar-6", classe: "bg-avatar-6", mapa: "cor:avatar" },
];
const PELE: ItemDeCor[] = [
  { token: "--pele-grad", classe: "bg-(image:--pele-grad)", mapa: "cor:pele-grad" },
  { token: "--pele-grad-texto", classe: "bg-(image:--pele-grad-texto)", mapa: "cor:pele-grad" },
  { token: "--pele-foco", classe: "bg-(--pele-foco)", mapa: "cor:pele-foco" },
];

// Os pares de texto que as telas mais usam, medidos no fundo em que aparecem.
const PARES: { nome: string; classe: string }[] = [
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

function Grupo({ titulo, itens, tema }: { titulo: string; itens: ItemDeCor[]; tema: Tema }) {
  const ids = [...new Set(itens.map((i) => i.mapa))];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label font-bold">{titulo}</h3>
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1">
            <SeloDoMapa id={id} tema={tema} />
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {itens.map((i) => (
          <Amostra key={i.token} token={i.token} classe={i.classe} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4">
        {ids.map((id) => (
          <RefDoPrototipo key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

export function SecaoCores({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao
      id={`cores-${tema}`}
      titulo={t("Cores")}
      apoio={t("Cada amostra é a classe que as telas usam, com o valor que o navegador computou neste painel.")}
    >
      <Grupo titulo={t("Superfícies")} itens={SUPERFICIES} tema={tema} />
      <Grupo titulo={t("Texto e linhas")} itens={TINTAS} tema={tema} />
      <Grupo titulo={t("Marca")} itens={MARCA} tema={tema} />
      <Grupo titulo={t("Estados")} itens={ESTADOS} tema={tema} />
      <Grupo titulo={t("Avatares")} itens={AVATARES} tema={tema} />
      <Grupo titulo={t("Pele do escuro (degradê e foco)")} itens={PELE} tema={tema} />
      <div className="flex flex-col gap-2">
        <h3 className="text-label font-bold">{t("Contraste dos pares de texto (AA = 4,5:1)")}</h3>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {PARES.map((p) => (
            <ParDeContraste key={p.nome} nome={p.nome} classe={p.classe} />
          ))}
        </div>
      </div>
    </Secao>
  );
}
