"use client";
import type { ReactNode } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MS_POR_HORA, novoIdDePasso, type PassoDaCadencia } from "@/lib/cadencia/timeline";
import { CaretDown, CaretUp, ChatCircle, Clock, Kanban, Plus, Tag, Trash } from "@/lib/ui/icons";
import { PassoMensagem } from "./PassoMensagem";

interface Etapa {
  id: string;
  name: string;
  is_lost?: boolean;
}

const TIPOS: ReadonlyArray<{ tipo: PassoDaCadencia["tipo"]; rotulo: string }> = [
  { tipo: "mensagem", rotulo: "Mensagem" },
  { tipo: "espera", rotulo: "Espera" },
  { tipo: "mover_etapa", rotulo: "Mover de etapa" },
  { tipo: "etiqueta", rotulo: "Etiqueta" },
];

function passoNovo(tipo: PassoDaCadencia["tipo"], id: string, etapas: Etapa[]): PassoDaCadencia {
  switch (tipo) {
    case "mensagem":
      return { id, tipo, variantes: [""] };
    case "espera":
      return { id, tipo, duracaoMs: 24 * MS_POR_HORA };
    case "mover_etapa":
      return { id, tipo, stageId: etapas.find((e) => !e.is_lost)?.id ?? "" };
    case "etiqueta":
      return { id, tipo, op: "add", tag: "" };
  }
}

/**
 * A RÉGUA, DE CIMA PARA BAIXO — o builder sequencial da cadência.
 *
 * Reordenar é por setas (e não arrastar): funciona no teclado e no celular sem
 * biblioteca nova, e a régua típica tem poucos passos. Etapa de PERDA não entra
 * na lista de "mover para": a publicação a recusa (exige motivo), e oferecer o
 * que vai ser recusado é mentir na tela.
 */
export function ListaDePassos({
  passos,
  onChange,
  etapas,
  renderPreview,
}: {
  passos: PassoDaCadencia[];
  onChange: (passos: PassoDaCadencia[]) => void;
  etapas: Etapa[];
  /** Prévia com lead de verdade, embaixo de cada mensagem (quem monta sabe a cadência e os leads). */
  renderPreview?: (variantes: string[]) => ReactNode;
}) {
  const t = useT();
  const ids = passos.map((p) => p.id);
  const trocar = (i: number, passo: PassoDaCadencia) => onChange(passos.map((p, j) => (j === i ? passo : p)));
  const mover = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= passos.length) return;
    const nova = [...passos];
    [nova[i], nova[j]] = [nova[j]!, nova[i]!];
    onChange(nova);
  };
  const etapasValidas = etapas.filter((e) => !e.is_lost);

  return (
    <ol className="space-y-3">
      {passos.map((passo, i) => (
        <li key={passo.id} className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tabular-nums">{i + 1}</span>
            {passo.tipo === "mensagem" && <ChatCircle size={16} aria-hidden />}
            {passo.tipo === "espera" && <Clock size={16} aria-hidden />}
            {passo.tipo === "mover_etapa" && <Kanban size={16} aria-hidden />}
            {passo.tipo === "etiqueta" && <Tag size={16} aria-hidden />}
            <span className="text-sm font-medium">{t(TIPOS.find((x) => x.tipo === passo.tipo)!.rotulo)}</span>
            <div className="ml-auto flex items-center">
              <Button type="button" variant="ghost" size="sm" className="size-9 p-0" aria-label={t("Subir passo")} disabled={i === 0} onClick={() => mover(i, -1)}>
                <CaretUp size={16} />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="size-9 p-0" aria-label={t("Descer passo")} disabled={i === passos.length - 1} onClick={() => mover(i, 1)}>
                <CaretDown size={16} />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="size-9 p-0" aria-label={t("Remover passo")} onClick={() => onChange(passos.filter((_, j) => j !== i))}>
                <Trash size={16} />
              </Button>
            </div>
          </div>

          {passo.tipo === "mensagem" && (
            <div className="space-y-2">
              <PassoMensagem variantes={passo.variantes} onChange={(variantes) => trocar(i, { ...passo, variantes })} />
              {renderPreview?.(passo.variantes)}
            </div>
          )}

          {passo.tipo === "espera" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">{t("Esperar")}</span>
              <Input
                type="number"
                min={1}
                className="w-24"
                aria-label={t("Horas de espera")}
                value={Math.round(passo.duracaoMs / MS_POR_HORA)}
                onChange={(e) => trocar(i, { ...passo, duracaoMs: Math.max(1, Number(e.target.value)) * MS_POR_HORA })}
              />
              <span className="text-text-muted">{t("horas")}</span>
              <span className="text-xs text-text-muted">
                ({(passo.duracaoMs / (24 * MS_POR_HORA)).toFixed(1).replace(".0", "")} {t("dias")})
              </span>
            </div>
          )}

          {passo.tipo === "mover_etapa" && (
            <select
              aria-label={t("Etapa de destino")}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={passo.stageId}
              onChange={(e) => trocar(i, { ...passo, stageId: e.target.value })}
            >
              <option value="" disabled>
                {t("Escolha a etapa")}
              </option>
              {etapasValidas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}

          {passo.tipo === "etiqueta" && (
            <div className="flex items-center gap-2">
              <select
                aria-label={t("Adicionar ou remover")}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={passo.op}
                onChange={(e) => trocar(i, { ...passo, op: e.target.value as "add" | "remove" })}
              >
                <option value="add">{t("Adicionar")}</option>
                <option value="remove">{t("Remover")}</option>
              </select>
              <Input
                aria-label={t("Etiqueta")}
                maxLength={60}
                placeholder={t("ex.: sem-resposta")}
                value={passo.tag}
                onChange={(e) => trocar(i, { ...passo, tag: e.target.value })}
              />
            </div>
          )}
        </li>
      ))}

      <li className="flex flex-wrap gap-2">
        {TIPOS.map((opcao) => (
          <Button
            key={opcao.tipo}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...passos, passoNovo(opcao.tipo, novoIdDePasso(ids), etapas)])}
          >
            <Plus size={14} className="mr-1" aria-hidden /> {t(opcao.rotulo)}
          </Button>
        ))}
      </li>
    </ol>
  );
}
