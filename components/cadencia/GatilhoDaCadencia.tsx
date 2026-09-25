"use client";
import { useT } from "@/hooks/i18n/useT";
import type { GatilhoDaCadencia } from "@/hooks/cadencia/useCadencias";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Etapa {
  id: string;
  name: string;
  is_lost?: boolean;
}

type Tipo = GatilhoDaCadencia["kind"];

const TIPOS: ReadonlyArray<{ valor: Tipo; rotulo: string }> = [
  { valor: "manual", rotulo: "Só quem eu inscrever (seleção no Kanban)" },
  { valor: "stage_change", rotulo: "Negócio que entrar numa etapa" },
  { valor: "tag_added", rotulo: "Negócio ou contato que ganhar uma etiqueta" },
  { valor: "agent_sla", rotulo: "Cliente sem resposta do time há um tempo" },
  { valor: "lead_idle", rotulo: "Lead sem responder há um tempo" },
];

const AJUDA: Record<Tipo, string> = {
  manual: "Você escolhe os negócios no Kanban e inscreve em lote.",
  stage_change: "Só entra quem chegar à etapa depois de publicar.",
  tag_added: "Vale a etiqueta posta depois de publicar. Etiqueta no contato inscreve o negócio aberto dele neste funil.",
  agent_sla: "O cliente escreveu e ninguém respondeu nesse tempo. Conta o número da cadência.",
  lead_idle: "Mandamos a última mensagem e o lead não respondeu nesse tempo.",
};

const UNIDADES: ReadonlyArray<{ valor: number; rotulo: string }> = [
  { valor: 1, rotulo: "minutos" },
  { valor: 60, rotulo: "horas" },
  { valor: 1440, rotulo: "dias" },
];

/** A maior unidade que divide o valor: 2880 min aparece como "2 dias", não "2880 minutos". */
function emUnidade(minutos: number): { quantidade: number; unidade: number } {
  for (const u of [1440, 60, 1]) {
    if (minutos % u === 0) return { quantidade: minutos / u, unidade: u };
  }
  return { quantidade: minutos, unidade: 1 };
}

function padraoDo(tipo: Tipo, etapas: Etapa[]): GatilhoDaCadencia {
  switch (tipo) {
    case "stage_change":
      return { kind: "stage_change", params: { stage_id: etapas[0]?.id ?? "" }, cancel_on_reply: true };
    case "tag_added":
      return { kind: "tag_added", params: { tag: "" }, cancel_on_reply: true };
    case "agent_sla":
      return { kind: "agent_sla", params: { threshold_minutes: 30 }, cancel_on_reply: true };
    case "lead_idle":
      return { kind: "lead_idle", params: { threshold_minutes: 2880 }, cancel_on_reply: true };
    default:
      return { kind: "manual", cancel_on_reply: true };
  }
}

/**
 * QUEM ENTRA NA CADÊNCIA — o gatilho, com o parâmetro de cada tipo.
 *
 * A régua de o que vale é do servidor (`lib/cadencia/gatilho.ts`); aqui só se
 * monta o valor e se explica, em uma linha, o que cada tipo faz.
 */
export function GatilhoDaCadenciaEditor({
  gatilho,
  onChange,
  etapas,
}: {
  gatilho: GatilhoDaCadencia;
  onChange: (g: GatilhoDaCadencia) => void;
  etapas: Etapa[];
}) {
  const t = useT();
  const abertas = etapas.filter((e) => !e.is_lost);

  return (
    <div className="space-y-2">
      <Label htmlFor="cadencia-gatilho">{t("Quem entra na cadência")}</Label>
      <select
        id="cadencia-gatilho"
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
        value={gatilho.kind}
        onChange={(e) => onChange(padraoDo(e.target.value as Tipo, abertas))}
      >
        {TIPOS.map((tipo) => (
          <option key={tipo.valor} value={tipo.valor}>
            {t(tipo.rotulo)}
          </option>
        ))}
      </select>

      {gatilho.kind === "stage_change" && (
        <select
          aria-label={t("Etapa que dispara a cadência")}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={gatilho.params.stage_id}
          onChange={(e) => onChange({ ...gatilho, params: { stage_id: e.target.value } })}
        >
          {abertas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )}

      {gatilho.kind === "tag_added" && (
        <Input
          aria-label={t("Etiqueta que dispara a cadência")}
          maxLength={60}
          placeholder={t("Ex.: Lista fria")}
          value={gatilho.params.tag}
          onChange={(e) => onChange({ ...gatilho, params: { tag: e.target.value } })}
        />
      )}

      {(gatilho.kind === "agent_sla" || gatilho.kind === "lead_idle") && (
        <TempoDoGatilho
          minutos={gatilho.params.threshold_minutes}
          unidades={gatilho.kind === "agent_sla" ? UNIDADES : UNIDADES.slice(1)}
          onChange={(threshold_minutes) => onChange({ ...gatilho, params: { threshold_minutes } })}
        />
      )}

      <p className="text-xs text-text-muted">
        {t(AJUDA[gatilho.kind])} {t("A cadência para sozinha quando o lead responde.")}
      </p>
    </div>
  );
}

function TempoDoGatilho({
  minutos,
  unidades,
  onChange,
}: {
  minutos: number;
  unidades: ReadonlyArray<{ valor: number; rotulo: string }>;
  onChange: (minutos: number) => void;
}) {
  const t = useT();
  const { quantidade, unidade } = emUnidade(minutos);
  const unidadeValida = unidades.some((u) => u.valor === unidade) ? unidade : unidades[0]!.valor;
  const qtd = unidadeValida === unidade ? quantidade : Math.max(1, Math.round(minutos / unidadeValida));
  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={1}
        aria-label={t("Quanto tempo")}
        className="w-24"
        value={qtd}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1) * unidadeValida)}
      />
      <select
        aria-label={t("Unidade de tempo")}
        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        value={unidadeValida}
        onChange={(e) => onChange(qtd * Number(e.target.value))}
      >
        {unidades.map((u) => (
          <option key={u.valor} value={u.valor}>
            {t(u.rotulo)}
          </option>
        ))}
      </select>
    </div>
  );
}
