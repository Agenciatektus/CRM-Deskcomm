"use client";

import { useState } from "react";

import { Icone } from "../../ui/Icones";
import { Avatar } from "../../ui/Pecas";
import { reais, type Cartao as DadosDoCartao } from "./dados";

function telefone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return `+55 21 9•••• ${String(h).padStart(4, "0")}`;
}

const BASE_PASSO = "flex min-h-7.5 items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px]";

/** O próximo passo (ProximoPassoDoCard): com prazo, cinza; atrasada, faixa vermelha; sem tarefa, tracejado. */
function ProximoPasso({ k }: { k: DadosDoCartao }) {
  if (!k.proximo) {
    return (
      <span className={`${BASE_PASSO} border border-dashed border-border-strong text-text-subtle`}>
        <Icone nome="plus" peso="regular" className="size-3.5 shrink-0" />
        <span>Sem próximo passo</span>
      </span>
    );
  }
  if (k.atrasado) {
    const d = k.atrasoDias ?? 1;
    return (
      <span className={`${BASE_PASSO} bg-error-bg font-semibold text-error-fg`}>
        <Icone nome="clock" peso="regular" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{k.proximo}</span>
        <b className="whitespace-nowrap">Atrasada {d} {d === 1 ? "dia" : "dias"}</b>
      </span>
    );
  }
  return (
    <span className={`${BASE_PASSO} border border-border bg-surface-elevated text-text-muted`}>
      <Icone nome="calendarBlank" peso="regular" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{k.proximo}</span>
      {k.quando ? <time className="whitespace-nowrap font-semibold text-text">{k.quando}</time> : null}
    </span>
  );
}

/** Tempo na etapa (TempoDoCard) ou espera pela resposta (EsperaDoLead). */
function Tempo({ k }: { k: DadosDoCartao }) {
  if (k.parado) {
    return (
      <span className="inline-flex items-center gap-1.25 rounded-md bg-warning-bg px-1.75 py-0.5 font-bold whitespace-nowrap text-warning-fg">
        <Icone nome="bandeira" peso="regular" className="size-3.5" /> Parado há {k.parado}
      </span>
    );
  }
  const espera = k.tempo.startsWith("esperando resposta há ");
  if (espera) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-warning-bg px-1.75 py-0.5 font-semibold whitespace-nowrap text-warning-fg">
        <Icone nome="ampulheta" peso="regular" className="size-3.5" />
        Esperando há {k.tempo.replace("esperando resposta há ", "")}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.25 whitespace-nowrap">
      <Icone nome="clock" peso="regular" className="size-3.5 shrink-0" />
      {k.tempo}
    </span>
  );
}

/** Responsável: agente = anel vazado com iniciais em mono; pessoa = avatar de 20 px e primeiro nome. */
function Responsavel({ k }: { k: DadosDoCartao }) {
  if (k.dono === "IA") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5" title="Agente de IA">
        <span
          aria-hidden="true"
          className="flex size-4 shrink-0 items-center justify-center rounded-full border border-accent bg-surface font-mono text-[8px] font-semibold text-accent ring-1 ring-accent/40 ring-inset"
        >
          IA
        </span>
        <span className="max-w-28 truncate text-[10px] text-text-muted">Agente</span>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-text-muted" title={`Responsável: ${k.dono}`}>
      <Avatar nome={k.dono} tom={k.tom} tamanho="size-[20px]" />
      <span className="truncate">{k.dono}</span>
    </span>
  );
}

/**
 * Cartão do Kanban (KanbanCard do CRM), com as mesmas classes: avatar com selo do canal e não lidas,
 * caixa de seleção que aparece no hover, valor, última mensagem, etiquetas, faixa do agente
 * (Propõe: Aprovar, Ignorar), próximo passo e rodapé (tempo na etapa, tarefas e responsável).
 */
export function Cartao({ k }: { k: DadosDoCartao }) {
  const [proposta, setProposta] = useState<"aberta" | "aprovada" | "ignorada">(k.proposta ? "aberta" : "ignorada");
  const [marcado, setMarcado] = useState(false);
  const selecionado = marcado || !!k.destaque;
  const abertas = k.proximo ? 1 : 0;
  return (
    <div
      role="group"
      aria-label={`Lead: ${k.nome}`}
      className={`group relative flex flex-col gap-2.5 overflow-hidden rounded-xl border px-3 pt-3 pb-2.5 text-left shadow-xs transition-[border-color,box-shadow] ${
        selecionado
          ? "a-pulso-borda border-accent bg-accent-soft ring-1 ring-accent"
          : "border-border bg-surface hover:border-border-strong hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="relative">
          <Avatar nome={k.nome} tom={k.tom} tamanho="size-9" />
          <span
            className={`absolute -right-1 -bottom-1 grid size-[17px] place-items-center rounded-full text-white ring-2 ${
              selecionado ? "ring-[#1d3943]" : "ring-surface"
            } ${k.canal === "whatsapp" ? "bg-[oklch(0.62_0.15_150)]" : "bg-[oklch(0.58_0.2_0)]"}`}
          >
            <Icone nome={k.canal === "whatsapp" ? "whatsappLogo" : "instagramLogo"} peso="fill" className="size-2.5" />
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h5 className="m-0 flex min-w-0 items-center text-sm leading-5 font-bold text-text">
            <span className="min-w-0 truncate">{k.nome}</span>
          </h5>
          <span className="truncate text-xs text-text-subtle tabular-nums">{telefone(k.id)}</span>
        </div>
        {k.naoLidas ? (
          <span className="mt-1 grid h-5 min-w-5 shrink-0 place-items-center self-start rounded-full bg-accent px-1.5 text-[11.5px] font-bold text-white tabular-nums">
            <span aria-hidden="true">{k.naoLidas}</span>
            <span className="sr-only">{k.naoLidas} mensagens não lidas</span>
          </span>
        ) : null}
        <input
          type="checkbox"
          checked={selecionado}
          onChange={(e) => setMarcado(e.target.checked)}
          aria-label={`Selecionar: ${k.nome}`}
          className={`mt-1.5 size-4 shrink-0 cursor-pointer self-start accent-accent transition-opacity focus:opacity-100 focus-visible:outline-2 focus-visible:outline-accent ${
            selecionado ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        />
      </div>

      {k.valor ? <span className="text-[15px] leading-tight font-bold text-text tabular-nums">{reais(k.valor)}</span> : null}

      <p className="m-0 mt-1 flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-text-muted">
        <Icone nome="conversa" peso="regular" className="size-3 shrink-0" />
        <span className="truncate">{k.ultima}</span>
      </p>

      <span className="flex flex-wrap gap-1">
        {k.etiquetas.map((e) => (
          <span key={e} className="inline-flex h-5.5 max-w-full items-center truncate rounded-full border border-border bg-surface px-2 text-xs text-text-muted">
            {e}
          </span>
        ))}
      </span>

      {k.proposta && proposta !== "ignorada" ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-accent" title={k.proposta}>
            {proposta === "aprovada" ? `Aprovado: ${k.proposta}` : `Propõe: ${k.proposta}`}
          </span>
          {proposta === "aberta" ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setProposta("aprovada")}
                aria-label={`Aprovar: ${k.proposta}`}
                className="cursor-pointer rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => setProposta("ignorada")}
                aria-label={`Ignorar: ${k.proposta}`}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                Ignorar
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      <ProximoPasso k={k} />

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-text-subtle">
        <Tempo k={k} />
        <div className="flex min-w-0 items-center gap-2">
          {abertas > 0 ? (
            <span
              role="img"
              aria-label={`${abertas} tarefa aberta${k.atrasado ? " · 1 atrasada" : ""}`}
              className={`flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums ${
                k.atrasado ? "font-semibold text-error-fg" : "text-text-muted"
              }`}
            >
              <Icone nome="listChecks" peso="regular" className="size-3" />
              {abertas}
              {k.atrasado ? (
                <>
                  <Icone nome="warning" peso="regular" className="ml-1 size-3" />1
                </>
              ) : null}
            </span>
          ) : null}
          <Responsavel k={k} />
        </div>
      </div>
    </div>
  );
}
