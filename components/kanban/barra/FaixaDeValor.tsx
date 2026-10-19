"use client";

import { useId } from "react";

import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";

import { Grupo } from "./Grupo";

type Centavos = number | null | undefined;

/** Atalhos de faixa (centavos). "Sem valor" é teto zero: valor ausente conta como 0. */
const FAIXAS: ReadonlyArray<{ rotulo: string; min: number | undefined; max: number | undefined }> = [
  { rotulo: "Sem valor", min: undefined, max: 0 },
  { rotulo: "Até 5 mil", min: undefined, max: 500_000 },
  { rotulo: "5 a 15 mil", min: 500_000, max: 1_500_000 },
  { rotulo: "Acima de 15 mil", min: 1_500_000, max: undefined },
];

const paraReais = (c: Centavos) => (typeof c === "number" ? String(c / 100) : "");
const deReais = (v: string): number | undefined => {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

/** Faixa de valor: De/Até em reais (campos nativos) e os atalhos do desenho. */
export function FaixaDeValor({
  min,
  max,
  onChange,
}: {
  min: Centavos;
  max: Centavos;
  onChange: (min: number | undefined, max: number | undefined) => void;
}) {
  const t = useT();
  const id = useId();
  const norm = (c: Centavos) => (typeof c === "number" ? c : undefined);
  return (
    <Grupo titulo={t("Faixa de valor")}>
      <div className="flex w-full items-center gap-2 text-sm">
        <label htmlFor={`${id}-de`} className="text-text-muted">{t("De R$")}</label>
        <Input
          id={`${id}-de`}
          type="number"
          inputMode="decimal"
          min={0}
          value={paraReais(min)}
          onChange={(e) => onChange(deReais(e.target.value), norm(max))}
          className="h-9 w-28"
        />
        <label htmlFor={`${id}-ate`} className="text-text-muted">{t("até")}</label>
        <Input
          id={`${id}-ate`}
          type="number"
          inputMode="decimal"
          min={0}
          placeholder={t("sem limite")}
          value={paraReais(max)}
          onChange={(e) => onChange(norm(min), deReais(e.target.value))}
          className="h-9 w-28"
        />
      </div>
      {FAIXAS.map((f) => {
        const ligado = norm(min) === f.min && norm(max) === f.max;
        return (
          <Chip key={f.rotulo} ligado={ligado} onClick={() => (ligado ? onChange(undefined, undefined) : onChange(f.min, f.max))}>
            {t(f.rotulo)}
          </Chip>
        );
      })}
    </Grupo>
  );
}
