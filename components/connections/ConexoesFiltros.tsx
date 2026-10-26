"use client";
import { Chip } from "@/components/ui/chip";
import { Escolha } from "@/components/ui/escolha";
import { Input } from "@/components/ui/input";
import type { VistaDeConexoes } from "@/hooks/channels/useVistaDeConexoes";
import { useT } from "@/hooks/i18n/useT";
import {
  ROTULO_DO_METODO,
  ROTULO_DO_TIPO,
  type FiltroDeStatus,
  type FiltrosDaLista,
  type MetodoDeConexao,
  type TipoDeConexao,
} from "@/lib/channels/conexoes-lista";
import { ListBullets, MagnifyingGlass, Stack } from "@/lib/ui/icons";

const TIPOS: TipoDeConexao[] = ["whatsapp", "instagram", "ligacao"];
const STATUS: { valor: FiltroDeStatus; rotulo: string }[] = [
  { valor: "", rotulo: "Todos os status" },
  { valor: "conectado", rotulo: "Conectado" },
  { valor: "atencao", rotulo: "Precisa de atenção" },
  { valor: "pausado", rotulo: "Pausado" },
];

export function ConexoesFiltros({
  filtros,
  onMudar,
  vista,
  onVista,
}: {
  filtros: FiltrosDaLista;
  onMudar: (f: FiltrosDaLista) => void;
  vista: VistaDeConexoes;
  onVista: (v: VistaDeConexoes) => void;
}) {
  const t = useT();
  const metodos = (Object.keys(ROTULO_DO_METODO) as MetodoDeConexao[]).map((m) => ({
    value: m,
    label: t(ROTULO_DO_METODO[m]),
  }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1 sm:max-w-xs">
        <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-3 text-muted-foreground" aria-hidden />
        <Input
          className="pl-8"
          value={filtros.busca}
          placeholder={t("Buscar por nome ou número")}
          aria-label={t("Buscar")}
          onChange={(e) => onMudar({ ...filtros, busca: e.target.value })}
        />
      </div>
      <Chip ligado={filtros.tipo === ""} onClick={() => onMudar({ ...filtros, tipo: "" })}>
        {t("Todas")}
      </Chip>
      {TIPOS.map((tp) => (
        <Chip key={tp} ligado={filtros.tipo === tp} onClick={() => onMudar({ ...filtros, tipo: tp })}>
          {t(ROTULO_DO_TIPO[tp])}
        </Chip>
      ))}
      <Escolha
        aria-label={t("Método")}
        data-testid="filtro-metodo"
        value={filtros.metodo}
        onValueChange={(v) => onMudar({ ...filtros, metodo: v as FiltrosDaLista["metodo"] })}
        opcoes={[{ value: "", label: t("Todos os métodos") }, ...metodos]}
        className="w-44"
      />
      <Escolha
        aria-label={t("Status")}
        data-testid="filtro-status"
        value={filtros.status}
        onValueChange={(v) => onMudar({ ...filtros, status: v as FiltroDeStatus })}
        opcoes={STATUS.map((s) => ({ value: s.valor, label: t(s.rotulo) }))}
        className="w-44"
      />
      <div role="group" aria-label={t("Modo de exibição")} className="ml-auto flex gap-1">
        <Chip ligado={vista === "galeria"} onClick={() => onVista("galeria")}>
          <Stack aria-hidden />
          {t("Galeria")}
        </Chip>
        <Chip ligado={vista === "lista"} onClick={() => onVista("lista")}>
          <ListBullets aria-hidden />
          {t("Lista")}
        </Chip>
      </div>
    </div>
  );
}
