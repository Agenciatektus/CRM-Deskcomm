"use client";

import type { ReactNode } from "react";

import { Chip } from "@/components/ui/chip";
import { Escolha } from "@/components/ui/escolha";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useOpcoesDeFunil } from "@/hooks/inbox/useOpcoesDeFunil";
import { useT } from "@/hooks/i18n/useT";
import { PERIODOS, ROTULO_DO_PERIODO, SEM_RESPONSAVEL, type EscolhaDoAtendimento } from "@/lib/inbox/filtros-do-atendimento";
import type { TipoDeCanal } from "@/lib/inbox/tipo-de-canal";

import type { InboxFiltersValue } from "../InboxFilters";
import { ROTULO_DO_TIPO } from "./chipsDosFiltros";

const ESCOLHA = "h-8 w-full text-xs mb:h-10 mb:text-sm";

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-border px-1 pt-2.5">
      <p className="px-1 text-xs font-semibold text-text-subtle">{titulo}</p>
      {children}
    </div>
  );
}

interface Props {
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
  /** Os tipos de canal conectados; o seletor só aparece com 2+ (ou com filtro ligado). */
  tiposDeCanal: TipoDeCanal[];
  /** No celular o tipo de canal já está na folha (chips): não repete aqui. */
  mostrarTipoDeCanal: boolean;
}

/**
 * Funil, etapas, responsável, tipo de canal e período da última mensagem (9051),
 * dentro do popover de filtros. As opções só são buscadas quando ele monta (aberto).
 */
export function FiltrosDoAtendimento({ value, onChange, tiposDeCanal, mostrarTipoDeCanal }: Props) {
  const t = useT();
  const { data: funis } = useOpcoesDeFunil(true);
  const { data: membros } = useAssignableMembers(true);
  const at: EscolhaDoAtendimento = value.atendimento ?? {};
  const mudar = (parcial: Partial<EscolhaDoAtendimento>) =>
    onChange({ ...value, atendimento: { ...at, ...parcial } });
  const funil = funis?.find((f) => f.id === at.funil);
  const etapas = at.etapas ?? [];
  const alternaEtapa = (id: string) =>
    mudar({ etapas: etapas.includes(id) ? etapas.filter((e) => e !== id) : [...etapas, id] });

  return (
    <>
      {(funis?.length ?? 0) > 0 && (
        <Secao titulo={t("Funil")}>
          <Escolha
            className={ESCOLHA}
            value={at.funil ?? ""}
            // Trocar de funil zera as etapas: a etapa é de um funil só.
            onValueChange={(v) => mudar({ funil: v || undefined, etapas: undefined })}
            aria-label={t("Filtrar por funil")}
          >
            <option value="">{t("Todos os funis")}</option>
            {funis?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Escolha>
          {funil && funil.etapas.length > 0 && (
            <div role="group" aria-label={t("Etapas do funil")} className="flex flex-wrap gap-1.5 px-1 pt-1">
              {funil.etapas.map((e) => (
                <Chip key={e.id} ligado={etapas.includes(e.id)} onClick={() => alternaEtapa(e.id)}>
                  {e.name}
                </Chip>
              ))}
            </div>
          )}
        </Secao>
      )}

      <Secao titulo={t("Responsável")}>
        <Escolha
          className={ESCOLHA}
          value={at.responsavel ?? ""}
          onValueChange={(v) => mudar({ responsavel: v || undefined })}
          aria-label={t("Filtrar por responsável")}
        >
          <option value="">{t("Todos")}</option>
          <option value={SEM_RESPONSAVEL}>{t("Sem responsável")}</option>
          {membros?.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name ?? t("Sem nome")}
            </option>
          ))}
        </Escolha>
      </Secao>

      {mostrarTipoDeCanal && (tiposDeCanal.length > 1 || value.canal) && (
        <Secao titulo={t("Canal")}>
          <Escolha
            className={ESCOLHA}
            value={value.canal ?? ""}
            onValueChange={(v) => onChange({ ...value, canal: (v || undefined) as TipoDeCanal | undefined })}
            aria-label={t("Filtrar por canal")}
          >
            <option value="">{t("Todos os canais")}</option>
            {tiposDeCanal.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULO_DO_TIPO[tipo]}
              </option>
            ))}
          </Escolha>
        </Secao>
      )}

      <Secao titulo={t("Última mensagem")}>
        <div role="group" aria-label={t("Período da última mensagem")} className="flex flex-wrap gap-1.5 px-1">
          {PERIODOS.map((p) => (
            <Chip
              key={p}
              ligado={at.periodo === p}
              onClick={() => mudar({ periodo: at.periodo === p ? undefined : p })}
            >
              {t(ROTULO_DO_PERIODO[p])}
            </Chip>
          ))}
        </div>
      </Secao>
    </>
  );
}

/** Nomes de funil, etapa e atendente para os chips (só busca o que está ligado). */
export function useNomesDoAtendimento(at: EscolhaDoAtendimento | undefined) {
  const { data: funis } = useOpcoesDeFunil(!!at?.funil);
  const { data: membros } = useAssignableMembers(!!at?.responsavel);
  return {
    funil: (id: string) => funis?.find((f) => f.id === id)?.name,
    etapa: (id: string) => funis?.flatMap((f) => f.etapas).find((e) => e.id === id)?.name,
    membro: (id: string) => membros?.find((m) => m.user_id === id)?.full_name ?? undefined,
  };
}
