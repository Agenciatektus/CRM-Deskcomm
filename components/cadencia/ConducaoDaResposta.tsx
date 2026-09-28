"use client";
import { useId } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useAgentsList } from "@/hooks/ai/useAgents";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  INSTRUCAO_MAX,
  MODO_PADRAO_DA_TELA,
  type ConducaoDaCadencia,
  type ConducaoPorIa,
  type ModoDaConducao,
  type PresetDaConducao,
} from "@/lib/cadencia/conducao/settings";
import { cn } from "@/lib/utils";

interface Etapa {
  id: string;
  name: string;
  is_lost?: boolean;
}

const OBJETIVOS: ReadonlyArray<{ valor: PresetDaConducao; rotulo: string; ajuda: string }> = [
  { valor: "agendar_reuniao", rotulo: "Agendar reunião", ajuda: "Oferece horários da agenda e marca a reunião." },
  { valor: "agendar_visita", rotulo: "Agendar visita", ajuda: "Oferece horários da agenda e marca a visita presencial." },
  { valor: "vender", rotulo: "Vender", ajuda: "Apresenta os produtos do catálogo e leva o lead à compra." },
  { valor: "qualificar", rotulo: "Qualificar", ajuda: "Descobre, com poucas perguntas, interesse, necessidade e prazo." },
];

const MODOS: ReadonlyArray<{ valor: ModoDaConducao; rotulo: string; ajuda: string }> = [
  { valor: "assistido", rotulo: "Assistido", ajuda: "Uma pessoa aprova cada resposta antes de sair." },
  { valor: "automatico", rotulo: "Automático", ajuda: "A IA envia a resposta sozinha." },
];

const QUEM_ATENDE: ReadonlyArray<{ valor: ConducaoDaCadencia["quem_atende"]; rotulo: string }> = [
  { valor: "atendente", rotulo: "Atendente" },
  { valor: "ia", rotulo: "Agente de IA" },
];

const CLASSE_DO_SELECT = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";

/**
 * QUANDO O LEAD RESPONDER — quem assume a conversa depois que a cadência para.
 *
 * O estado mora em `cadence_settings.conducao` (rascunho). Só vale no ar depois
 * de republicar. Ao escolher a IA, o modo nasce ASSISTIDO: uma pessoa aprova a
 * resposta antes de sair, e passar para automático exige administrador.
 */
export function ConducaoDaResposta({
  conducao,
  onChange,
  etapas,
  etapaDoGatilho,
}: {
  conducao: ConducaoDaCadencia;
  onChange: (c: ConducaoDaCadencia) => void;
  etapas: Etapa[];
  etapaDoGatilho: string | null;
}) {
  const t = useT();
  const id = useId();
  const agentes = useAgentsList();
  const publicados = (agentes.data ?? []).filter(
    (a) => a.is_active && !a.archived_at && Boolean(a.published_version_id),
  );
  const alvos = etapas.filter((e) => !e.is_lost && e.id !== etapaDoGatilho);
  const ia = conducao.quem_atende === "ia" ? conducao : null;
  const semAgente = publicados.length === 0;
  const semEtapa = alvos.length === 0;

  function escolherQuemAtende(valor: ConducaoDaCadencia["quem_atende"]) {
    if (valor === conducao.quem_atende) return;
    if (valor === "atendente") return onChange({ quem_atende: "atendente" });
    onChange({
      quem_atende: "ia",
      agent_id: publicados[0]?.id ?? "",
      preset: "qualificar",
      etapa_alvo_id: alvos[0]?.id ?? "",
      modo: MODO_PADRAO_DA_TELA,
    });
  }

  const mudarIa = (parcial: Partial<ConducaoPorIa>) => ia && onChange({ ...ia, ...parcial });
  const agenteNaLista = ia ? publicados.some((a) => a.id === ia.agent_id) : false;
  const etapaNaLista = ia ? alvos.some((e) => e.id === ia.etapa_alvo_id) : false;
  const objetivo = ia ? OBJETIVOS.find((o) => o.valor === ia.preset) : undefined;
  const instrucao = ia?.instrucao ?? "";

  return (
    <div className="space-y-4" data-testid="conducao-da-resposta">
      <fieldset className="space-y-2">
        <legend className="text-xs text-text-muted">{t("Quem atende a conversa")}</legend>
        {QUEM_ATENDE.map((opcao) => {
          const bloqueada = opcao.valor === "ia" && !ia && (semAgente || semEtapa);
          return (
            <label
              key={opcao.valor}
              className={cn(
                "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm",
                bloqueada ? "opacity-55" : "cursor-pointer hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name={`${id}-quem`}
                className="size-4 accent-primary"
                checked={conducao.quem_atende === opcao.valor}
                disabled={bloqueada}
                onChange={() => escolherQuemAtende(opcao.valor)}
              />
              {t(opcao.rotulo)}
            </label>
          );
        })}
        {!ia && semAgente && !agentes.isLoading && (
          <p className="text-xs text-text-muted">{t("Publique um agente de IA para usar esta opção.")}</p>
        )}
        {!ia && !semAgente && semEtapa && (
          <p className="text-xs text-text-muted">{t("O funil precisa de uma etapa aberta além da que dispara a cadência.")}</p>
        )}
      </fieldset>

      {ia && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-agente`}>{t("Agente")}</Label>
            <select
              id={`${id}-agente`}
              className={CLASSE_DO_SELECT}
              value={agenteNaLista ? ia.agent_id : ""}
              onChange={(e) => mudarIa({ agent_id: e.target.value })}
            >
              <option value="" disabled>
                {t("Escolha o agente")}
              </option>
              {publicados.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-objetivo`}>{t("Objetivo")}</Label>
            <select
              id={`${id}-objetivo`}
              className={CLASSE_DO_SELECT}
              value={ia.preset}
              onChange={(e) => mudarIa({ preset: e.target.value as PresetDaConducao })}
            >
              {OBJETIVOS.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {t(o.rotulo)}
                </option>
              ))}
            </select>
            {objetivo && <p className="text-xs text-text-muted">{t(objetivo.ajuda)}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-etapa`}>{t("Até qual etapa a IA conduz")}</Label>
            <select
              id={`${id}-etapa`}
              className={CLASSE_DO_SELECT}
              value={etapaNaLista ? ia.etapa_alvo_id : ""}
              onChange={(e) => mudarIa({ etapa_alvo_id: e.target.value })}
            >
              <option value="" disabled>
                {t("Escolha a etapa")}
              </option>
              {alvos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted">
              {t("Quando o negócio chegar nessa etapa, a IA passa a conversa para o time.")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-instrucao`}>{t("Instrução para a IA")}</Label>
            <Textarea
              id={`${id}-instrucao`}
              rows={4}
              maxLength={INSTRUCAO_MAX}
              value={instrucao}
              placeholder={t("Ex.: Fale de forma simples e ofereça horários à tarde.")}
              aria-describedby={`${id}-contador`}
              onChange={(e) => mudarIa({ instrucao: e.target.value })}
            />
            <p id={`${id}-contador`} className="text-right text-xs tabular-nums text-text-muted" aria-live="polite">
              {instrucao.length}/{INSTRUCAO_MAX}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Modo")}</legend>
            {MODOS.map((m) => (
              <label
                key={m.valor}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <input
                  type="radio"
                  name={`${id}-modo`}
                  className="mt-0.5 size-4 accent-primary"
                  checked={ia.modo === m.valor}
                  onChange={() => mudarIa({ modo: m.valor })}
                />
                <span>
                  <span className="block">{t(m.rotulo)}</span>
                  <span className="block text-xs text-text-muted">{t(m.ajuda)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}

      <p className="text-xs text-text-muted">
        {t("Mudar agente, instrução, quem atende ou passar para automático exige administrador.")}
      </p>
    </div>
  );
}
