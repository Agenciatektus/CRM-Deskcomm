"use client";

import { useState } from "react";

import { Icone } from "../../ui/Icones";
import { Avatar, Selo } from "../../ui/Pecas";
import { reais, type Cartao as DadosDoCartao } from "./dados";

function telefone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return `+55 21 9•••• ${String(h).padStart(4, "0")}`;
}

/**
 * Cartão do Kanban (KanbanCard do CRM): avatar com selo do canal e não lidas, nome e telefone mascarado,
 * valor, última mensagem, etiqueta, faixa do agente (Propõe, Aprovar ou Ignorar), próximo passo e rodapé
 * com tempo na etapa e responsável.
 */
export function Cartao({ k }: { k: DadosDoCartao }) {
  const [proposta, setProposta] = useState<"aberta" | "aprovada" | "ignorada">(k.proposta ? "aberta" : "ignorada");
  return (
    <div
      className={`flex flex-col gap-2.5 overflow-hidden rounded-xl border px-3 pt-3 pb-2.5 text-left shadow-(--shadow-e1) ${
        k.destaque ? "a-pulso-borda border-accent bg-accent-soft ring-1 ring-accent" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="relative">
          <Avatar nome={k.nome} tom={k.tom} tamanho="size-9" />
          <span
            className={`absolute -right-1 -bottom-1 grid size-[17px] place-items-center rounded-full text-white ring-2 ${
              k.destaque ? "ring-[#1d3943]" : "ring-surface"
            } ${k.canal === "whatsapp" ? "bg-[oklch(0.62_0.15_150)]" : "bg-[oklch(0.58_0.2_0)]"}`}
          >
            <Icone nome={k.canal === "whatsapp" ? "chat" : "camera"} peso="bold" className="size-2.5" />
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="m-0 truncate text-sm leading-5 font-bold">{k.nome}</p>
          <span className="truncate text-xs text-text-subtle tabular-nums">{telefone(k.id)}</span>
        </div>
        {k.naoLidas ? (
          <span
            aria-label={`${k.naoLidas} não lidas`}
            className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white tabular-nums"
          >
            {k.naoLidas}
          </span>
        ) : null}
      </div>

      {k.valor ? <span className="text-[15px] leading-tight font-bold tabular-nums">{reais(k.valor)}</span> : null}

      <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <Icone nome="conversa" className="size-3 shrink-0" />
        <span className="truncate">{k.ultima}</span>
      </span>

      <span className="flex flex-wrap gap-1">
        {k.etiquetas.map((e) => (
          <span key={e} className="inline-flex h-[22px] items-center rounded-full border border-border bg-surface px-2 text-xs text-text-muted">
            {e}
          </span>
        ))}
      </span>

      {k.proposta && proposta !== "ignorada" ? (
        <div className="flex flex-col gap-2 rounded-card border border-border-strong bg-surface-2 p-2">
          <p className="m-0 flex items-start gap-1.5 text-xs text-text">
            <Icone nome="faiscas" className="mt-px size-3.5 shrink-0 text-accent-text" />
            {proposta === "aprovada" ? (
              <span>Aprovado: {k.proposta}</span>
            ) : (
              <span>
                <b>Propõe:</b> {k.proposta}
              </span>
            )}
          </p>
          {proposta === "aberta" ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setProposta("aprovada")}
                aria-label={`Aprovar a proposta do agente para ${k.nome}`}
                className="h-7 flex-1 cursor-pointer rounded-controle bg-(image:--degrade) text-xs font-semibold text-white"
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => setProposta("ignorada")}
                aria-label={`Ignorar a proposta do agente para ${k.nome}`}
                className="h-7 flex-1 cursor-pointer rounded-controle border border-border-strong text-xs font-semibold text-text-muted hover:text-text"
              >
                Ignorar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {k.proximo ? (
        <span
          className={`flex items-center gap-1.5 text-xs font-semibold ${k.atrasado ? "text-error-fg" : "text-text-muted"}`}
        >
          <Icone nome={k.atrasado ? "alarme" : "tarefa"} className="size-3.5 shrink-0" />
          <span className="truncate">{k.proximo}</span>
        </span>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-text-subtle">
        {k.parado ? (
          <span className="inline-flex items-center gap-1 rounded-controle bg-warning-bg px-1.5 py-0.5 font-bold whitespace-nowrap text-warning-fg">
            <Icone nome="bandeira" className="size-3.5" /> Parado há {k.parado}
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Icone nome="relogio" className="size-3.5 shrink-0" />
            <span className="truncate">{k.tempo}</span>
          </span>
        )}
        {k.dono === "IA" ? (
          <Selo tom="ia">
            <Icone nome="agente" className="size-3" /> IA
          </Selo>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-text-muted">
            <Avatar nome={k.dono} tom={k.tom} tamanho="size-5" />
            {k.dono}
          </span>
        )}
      </div>
    </div>
  );
}
