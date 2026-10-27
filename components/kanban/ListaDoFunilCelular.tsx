"use client";

import Link from "next/link";
import { useMemo, useRef, type MouseEvent } from "react";

import { useT } from "@/hooks/i18n/useT";
import { canalDoCard, iniciaisDoCard, nomeDoCard } from "@/lib/kanban/identidade-do-card";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import { origemDoLead, rotuloDaOrigem } from "@/lib/kanban/recorte-do-funil";
import { formatValorDoNegocio, MOEDA_PADRAO } from "@/lib/money";
import { cn } from "@/lib/utils";

import { AvatarDoLead } from "./AvatarDoLead";
import { type PropsDaLista } from "./ListaDoFunil";
import { EsperaDoLead, ProximoPassoDoCard, ResponsavelDoCard } from "./PartesDoCard";

/** Quanto segurar o dedo para entrar na seleção (ms). */
export const TOQUE_LONGO_MS = 500;

/**
 * A LISTA do Funil no celular: cards empilhados com etapa, espera, próximo
 * passo e origem. Segurar um card entra na seleção; com seleção viva, tocar
 * marca e desmarca (e o card não abre). A caixa de seleção existe sempre para
 * o teclado e o leitor de tela; aparece na tela durante a seleção.
 */
export function ListaDoFunilCelular({ leads, stages, ownerNames, selectedIds, onSelectionChange }: PropsDaLista) {
  const t = useT();
  const agora = useMemo(() => new Date(), [leads]); // eslint-disable-line react-hooks/exhaustive-deps
  const etapa = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const marcados = new Set(selectedIds);
  const selecionando = selectedIds.length > 0;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segurou = useRef(false);

  const alterna = (id: string) =>
    onSelectionChange(marcados.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const cancela = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const comeca = (id: string) => {
    segurou.current = false;
    cancela();
    timer.current = setTimeout(() => {
      segurou.current = true;
      alterna(id);
    }, TOQUE_LONGO_MS);
  };
  const aoTocar = (id: string) => (e: MouseEvent) => {
    if (segurou.current || selecionando) {
      e.preventDefault();
      if (!segurou.current) alterna(id);
      segurou.current = false;
    }
  };

  if (leads.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-text-muted">{t("Nenhum lead neste recorte.")}</p>;
  }

  return (
    <div className="flex flex-col gap-2 px-4" data-lista-do-funil>
      {selecionando && (
        <div className="flex items-center justify-between text-sm">
          <b>{`${selectedIds.length} ${selectedIds.length === 1 ? t("selecionado") : t("selecionados")}`}</b>
          <button type="button" className="min-h-11 px-2 font-semibold text-accent-text" onClick={() => onSelectionChange(leads.map((l) => l.id))}>
            {t("Selecionar todos")}
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-2.5">
        {leads.map((l) => {
          const nome = nomeDoCard(l).nome || t("Sem nome");
          const marcado = marcados.has(l.id);
          return (
            <li
              key={l.id}
              onPointerDown={() => comeca(l.id)}
              onPointerUp={cancela}
              onPointerLeave={cancela}
              onPointerMove={(e) => (Math.abs(e.movementY) > 4 ? cancela() : undefined)}
              onContextMenu={(e) => e.preventDefault()}
              className={cn(
                "relative rounded-2xl bg-surface shadow-[0_0_0_1px_var(--color-border)] select-none",
                marcado && "shadow-[0_0_0_2px_var(--color-accent)]",
              )}
            >
              <label className={cn("absolute top-3 right-3 grid size-11 place-items-center", !selecionando && "sr-only")}>
                <span className="sr-only">{`${t("Selecionar")} ${nome}`}</span>
                <input type="checkbox" checked={marcado} onChange={() => alterna(l.id)} className="size-5" />
              </label>
              <Link href={`/app/leads/${l.id}`} onClick={aoTocar(l.id)} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 p-3.5 pr-14">
                <AvatarDoLead
                  semente={l.contact_id ?? l.id}
                  iniciais={iniciaisDoCard(nome)}
                  foto={l.contact_tem_foto && l.contact_id ? `/api/v1/contacts/${l.contact_id}/avatar` : null}
                  canal={canalDoCard(l)}
                />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex items-baseline gap-2">
                    <b className="min-w-0 flex-1 truncate text-base text-text">{nome}</b>
                    {l.value_cents && l.value_cents > 0 ? (
                      <span className="text-sm font-bold whitespace-nowrap">{formatValorDoNegocio(l.value_cents, l.currency ?? MOEDA_PADRAO, { semCentavos: true })}</span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-muted">
                    <span className="font-semibold">{etapa.get(l.stage_id) ?? ""}</span>
                    <EsperaDoLead lead={l} agora={agora} comRotulo />
                  </span>
                  {l.proximo_passo !== undefined && <ProximoPassoDoCard passo={l.proximo_passo} agora={agora} />}
                  <span className="flex items-center justify-between gap-2 text-[12.5px] text-text-subtle">
                    <span className="truncate">{`${t("Origem")}: ${t(rotuloDaOrigem(origemDoLead(l)))}`}</span>
                    <ResponsavelDoCard owner={resolveLeadOwner(l, ownerNames)} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
