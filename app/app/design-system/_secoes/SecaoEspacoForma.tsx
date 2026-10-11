"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import { Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

const ESPACOS = [
  { nome: "1 · 4", classe: "size-1" },
  { nome: "2 · 8", classe: "size-2" },
  { nome: "3 · 12", classe: "size-3" },
  { nome: "4 · 16", classe: "size-4" },
  { nome: "5 · 20", classe: "size-5" },
  { nome: "6 · 24", classe: "size-6" },
  { nome: "8 · 32", classe: "size-8" },
  { nome: "12 · 48", classe: "size-12" },
];

const RAIOS_DO_CRM = [
  { nome: "sm · 4", classe: "rounded-sm" },
  { nome: "md · 8", classe: "rounded-md" },
  { nome: "lg · 12", classe: "rounded-lg" },
  { nome: "xl · 16", classe: "rounded-xl" },
  { nome: "full", classe: "rounded-full" },
];

const RAIOS_NOVOS = [
  { nome: "pill · 6", classe: "rounded-pill" },
  { nome: "control · 9", classe: "rounded-control" },
  { nome: "field · 10", classe: "rounded-field" },
  { nome: "menu · 14", classe: "rounded-menu" },
  { nome: "bubble · 18/6", classe: "rounded-bubble rounded-bl-bubble-tail" },
];

const SOMBRAS = [
  { nome: "shadow-xs", classe: "shadow-xs" },
  { nome: "shadow-sm", classe: "shadow-sm" },
  { nome: "shadow-md", classe: "shadow-md" },
  { nome: "shadow-lg", classe: "shadow-lg" },
  { nome: "shadow-xl", classe: "shadow-xl" },
  { nome: "shadow-pop", classe: "shadow-pop" },
  { nome: "shadow-bubble", classe: "shadow-bubble" },
  { nome: "pele-cartao", classe: "pele-cartao" },
];

function Grade({ itens, forma }: { itens: { nome: string; classe: string }[]; forma: string }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {itens.map((i) => (
        <div key={i.nome} className="flex flex-col items-center gap-1.5">
          <i className={cn(forma, i.classe)} aria-hidden />
          <code className="text-meta text-text-subtle">{i.nome}</code>
        </div>
      ))}
    </div>
  );
}

export function SecaoEspacoForma({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <>
      <Secao id={`espaco-${tema}`} titulo={t("Espaçamento e raios")}>
        <Exemplo nome={t("Escala de espaço (base 4)")} mapa="espaco:escala" tema={tema}>
          <Grade itens={ESPACOS} forma="block rounded-sm border border-accent bg-accent-soft" />
        </Exemplo>
        <Exemplo nome={t("Respiro da linha da lista")} mapa="espaco:linha" tema={tema}>
          <p className="text-ui text-text-muted">
            {t("Protótipo: 12px (8px no compacto). CRM: --density-py 16px, sem modo compacto.")}
          </p>
        </Exemplo>
        <Exemplo nome={t("Raios do CRM")} mapa="raio:escala" tema={tema}>
          <Grade itens={RAIOS_DO_CRM} forma="block size-14 border border-border-strong bg-surface-elevated" />
        </Exemplo>
        <Exemplo nome={t("Raios do protótipo, em tokens novos")} mapa="raio:escala" tema={tema}>
          <Grade itens={RAIOS_NOVOS} forma="block size-14 border border-border-strong bg-surface-elevated" />
        </Exemplo>
      </Secao>
      <Secao id={`sombra-${tema}`} titulo={t("Sombras, elevação, foco e movimento")}>
        <Exemplo nome={t("Sombras")} mapa="sombra:pop" tema={tema}>
          <Grade itens={SOMBRAS} forma="block h-14 w-20 rounded-lg border border-border bg-surface" />
          <p className="text-meta text-text-subtle">
            {t("shadow-pop e shadow-bubble são novos. pele-cartao é a sombra dura de 4px do escuro (no claro não tem efeito).")}
          </p>
        </Exemplo>
        <Exemplo nome={t("Anel de foco (use Tab)")} mapa="foco:anel" tema={tema}>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary">{t("Foco do botão")}</Button>
            <a href="#ds-topo" className="text-ui text-accent underline underline-offset-4">
              {t("Foco de link")}
            </a>
          </div>
        </Exemplo>
        <Exemplo nome={t("Curva e duração")} mapa="movimento:curva" tema={tema}>
          <div className="flex flex-wrap gap-6">
            <div className="group flex flex-col gap-1.5">
              <span className="text-meta text-text-subtle">ease-out · duration-fast (CRM)</span>
              <span className="block h-2 w-40 rounded-full bg-surface-elevated">
                <span className="block h-2 w-6 rounded-full bg-accent transition-[width] duration-fast ease-out group-hover:w-40" />
              </span>
            </div>
            <div className="group flex flex-col gap-1.5">
              <span className="text-meta text-text-subtle">ease-emphasized · duration-ui</span>
              <span className="block h-2 w-40 rounded-full bg-surface-elevated">
                <span className="block h-2 w-6 rounded-full bg-accent transition-[width] duration-ui ease-emphasized group-hover:w-40" />
              </span>
            </div>
          </div>
          <p className="text-meta text-text-subtle">{t("Passe o mouse sobre as barras.")}</p>
        </Exemplo>
      </Secao>
    </>
  );
}
