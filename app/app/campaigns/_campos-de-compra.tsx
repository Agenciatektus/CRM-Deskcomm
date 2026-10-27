"use client";
/**
 * Critérios de COMPRA do filtro de audiência, mais o bloco "Excluir quem...".
 * Compartilhado pela criação e pela edição: a conversão reais <-> centavos e a
 * montagem do payload ficam num lugar só.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

/** Texto cru dos 4 campos, como o operador digita. */
export type CamposDeCompra = {
  ultimaMin: string;
  ultimaMax: string;
  comprasMin: string;
  gasto: string;
};

export const COMPRA_VAZIA: CamposDeCompra = {
  ultimaMin: "",
  ultimaMax: "",
  comprasMin: "",
  gasto: "",
};

export type CriteriosDeCompra = {
  ultima_compra_ha_dias_min: number | null;
  ultima_compra_ha_dias_max: number | null;
  compras_min: number | null;
  gasto_min_centavos: number | null;
};

function inteiro(bruto: string): number | null {
  const limpo = bruto.trim();
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isInteger(n) ? n : null;
}

/** "150,00" e "1.234,56" viram centavos; vazio ou inválido vira null. */
export function reaisParaCentavos(bruto: string): number | null {
  const limpo = bruto.trim();
  if (limpo === "") return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function centavosParaReais(centavos: unknown): string {
  return typeof centavos === "number" && Number.isFinite(centavos)
    ? (centavos / 100).toFixed(2).replace(".", ",")
    : "";
}

export function criteriosDeCompra(c: CamposDeCompra): CriteriosDeCompra {
  return {
    ultima_compra_ha_dias_min: inteiro(c.ultimaMin),
    ultima_compra_ha_dias_max: inteiro(c.ultimaMax),
    compras_min: inteiro(c.comprasMin),
    gasto_min_centavos: reaisParaCentavos(c.gasto),
  };
}

export function temCriterioDeCompra(c: CriteriosDeCompra): boolean {
  return Object.values(c).some((v) => v !== null);
}

/** Lê o bloco salvo (qualquer forma, inclusive filtro antigo sem os campos). */
export function compraDoFiltro(f: unknown): CamposDeCompra {
  const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  const txt = (v: unknown) => (typeof v === "number" ? String(v) : "");
  return {
    ultimaMin: txt(o.ultima_compra_ha_dias_min),
    ultimaMax: txt(o.ultima_compra_ha_dias_max),
    comprasMin: txt(o.compras_min),
    gasto: centavosParaReais(o.gasto_min_centavos),
  };
}

/** Payload do `excluir`: null quando os 4 campos estão vazios. */
export function excluirDoFiltro(c: CamposDeCompra): CriteriosDeCompra | null {
  const criterios = criteriosDeCompra(c);
  return temCriterioDeCompra(criterios) ? criterios : null;
}

function Campos({
  prefixo,
  valor,
  onChange,
}: {
  prefixo: string;
  valor: CamposDeCompra;
  onChange: (v: CamposDeCompra) => void;
}) {
  const t = useT();
  const campo = (
    chave: keyof CamposDeCompra,
    rotulo: string,
    min: number,
    inputMode?: "decimal",
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`${prefixo}-${chave}`}>{t(rotulo)}</Label>
      <Input
        id={`${prefixo}-${chave}`}
        type={chave === "gasto" ? "text" : "number"}
        inputMode={inputMode}
        min={chave === "gasto" ? undefined : min}
        value={valor[chave]}
        onChange={(e) => onChange({ ...valor, [chave]: e.target.value })}
      />
    </div>
  );
  return (
    <>
      {campo("ultimaMin", "Última compra há pelo menos (dias)", 0)}
      {campo("ultimaMax", "Última compra há no máximo (dias)", 0)}
      {campo("comprasMin", "Pelo menos N compras", 1)}
      {campo("gasto", "Gasto total mínimo (R$)", 0, "decimal")}
    </>
  );
}

export function CamposDeCompraDoFiltro({
  prefixo,
  compra,
  onCompra,
  excluir,
  onExcluir,
}: {
  prefixo: string;
  compra: CamposDeCompra;
  onCompra: (v: CamposDeCompra) => void;
  excluir: CamposDeCompra;
  onExcluir: (v: CamposDeCompra) => void;
}) {
  const t = useT();
  return (
    <>
      <Campos prefixo={prefixo} valor={compra} onChange={onCompra} />
      <p className="text-xs text-muted-foreground sm:col-span-2">
        {t("Conta só pedido pago ou entregue, sem cancelado, estornado ou pendente.")}
      </p>
      <fieldset className="space-y-3 sm:col-span-2">
        <legend className="text-sm font-medium">{t("Excluir quem...")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campos prefixo={`${prefixo}-excluir`} valor={excluir} onChange={onExcluir} />
        </div>
      </fieldset>
    </>
  );
}
