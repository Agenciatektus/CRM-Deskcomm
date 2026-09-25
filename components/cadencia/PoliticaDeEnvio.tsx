"use client";
import { useT } from "@/hooks/i18n/useT";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import type { PoliticaDaCadencia } from "@/hooks/cadencia/useCadencias";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ESPACAMENTO_MAXIMO_S,
  ESPACAMENTO_MINIMO_S,
  MAX_INSCRICOES_DIA_TETO,
} from "@/lib/cadencia/settings";
import { cn } from "@/lib/utils";
import { CotaDoNumero } from "./CotaDoNumero";

/** 0 = domingo … 6 = sábado, a mesma convenção da janela de atendimento. */
const DIAS: ReadonlyArray<{ valor: number; rotulo: string }> = [
  { valor: 1, rotulo: "Seg" },
  { valor: 2, rotulo: "Ter" },
  { valor: 3, rotulo: "Qua" },
  { valor: 4, rotulo: "Qui" },
  { valor: 5, rotulo: "Sex" },
  { valor: 6, rotulo: "Sáb" },
  { valor: 0, rotulo: "Dom" },
];

/**
 * A POLÍTICA DE ENVIO da cadência — o que decide QUANDO e QUANTO sai.
 *
 * O número só aparece se estiver conectado ou for o já escolhido: oferecer um
 * número caído é convidar a publicar uma régua que não envia. A base legal (LIA)
 * não tem padrão de propósito: quem responde por ela é quem a escreve.
 */
export function PoliticaDeEnvio({
  politica,
  onChange,
  channelSessionId,
  onChangeNumero,
  numeroTravado,
}: {
  politica: PoliticaDaCadencia;
  onChange: (p: PoliticaDaCadencia) => void;
  channelSessionId: string | null;
  onChangeNumero: (id: string) => void;
  /** Com a cadência no ar o número não muda (as conversas dos inscritos são dele). */
  numeroTravado: boolean;
}) {
  const t = useT();
  const { data: sessoes } = useChannelSessions();
  const numeros = (sessoes ?? []).filter((s) => s.status === "WORKING" || s.id === channelSessionId);

  const alternarDia = (dia: number) => {
    const tem = politica.janela.weekdays.includes(dia);
    const weekdays = tem ? politica.janela.weekdays.filter((d) => d !== dia) : [...politica.janela.weekdays, dia];
    onChange({ ...politica, janela: { ...politica.janela, weekdays: weekdays.sort() } });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <Label htmlFor="cadencia-numero">{t("Número que envia")}</Label>
        <select
          id="cadencia-numero"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-60"
          value={channelSessionId ?? ""}
          disabled={numeroTravado}
          onChange={(e) => onChangeNumero(e.target.value)}
        >
          <option value="" disabled>
            {t("Escolha um número conectado")}
          </option>
          {numeros.map((s) => (
            <option key={s.id} value={s.id}>
              {channelLabel(s, t)}
            </option>
          ))}
        </select>
        {numeroTravado && (
          <p className="text-xs text-text-muted">{t("Para trocar o número, desligue a cadência antes.")}</p>
        )}
        <CotaDoNumero channelSessionId={channelSessionId} />
      </section>

      <section className="space-y-2">
        <span className="text-sm font-medium">{t("Dias e horário de envio")}</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Dias da semana")}>
          {DIAS.map((d) => {
            const ligado = politica.janela.weekdays.includes(d.valor);
            return (
              <button
                key={d.valor}
                type="button"
                aria-pressed={ligado}
                onClick={() => alternarDia(d.valor)}
                className={cn(
                  "h-9 min-w-11 rounded-md border px-2 text-sm transition-colors",
                  ligado ? "border-primary bg-primary text-primary-foreground" : "border-border text-text-muted hover:bg-muted",
                )}
              >
                {t(d.rotulo)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="time"
            aria-label={t("Início")}
            className="w-32"
            value={politica.janela.start}
            onChange={(e) => onChange({ ...politica, janela: { ...politica.janela, start: e.target.value } })}
          />
          <span className="text-text-muted">{t("até")}</span>
          <Input
            type="time"
            aria-label={t("Fim")}
            className="w-32"
            value={politica.janela.end}
            onChange={(e) => onChange({ ...politica, janela: { ...politica.janela, end: e.target.value } })}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cadencia-min">{t("Intervalo mínimo (s)")}</Label>
          <Input
            id="cadencia-min"
            type="number"
            min={ESPACAMENTO_MINIMO_S}
            max={ESPACAMENTO_MAXIMO_S}
            value={politica.espacamento.min_s}
            onChange={(e) =>
              onChange({ ...politica, espacamento: { ...politica.espacamento, min_s: Number(e.target.value) } })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cadencia-max">{t("Intervalo máximo (s)")}</Label>
          <Input
            id="cadencia-max"
            type="number"
            min={ESPACAMENTO_MINIMO_S}
            max={ESPACAMENTO_MAXIMO_S}
            value={politica.espacamento.max_s}
            onChange={(e) =>
              onChange({ ...politica, espacamento: { ...politica.espacamento, max_s: Number(e.target.value) } })
            }
          />
        </div>
        <p className="col-span-2 text-xs text-text-muted">
          {t("Entre duas mensagens automáticas do número, espera um tempo sorteado nesse intervalo.")}
        </p>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="cadencia-teto">{t("Novas inscrições por dia")}</Label>
          <Input
            id="cadencia-teto"
            type="number"
            min={1}
            max={MAX_INSCRICOES_DIA_TETO}
            value={politica.max_inscricoes_dia}
            onChange={(e) => onChange({ ...politica, max_inscricoes_dia: Number(e.target.value) })}
          />
        </div>
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="cadencia-lia">{t("Base legal do contato frio (LIA)")}</Label>
        <Textarea
          id="cadencia-lia"
          rows={2}
          placeholder={t("Ex.: LIA 2026-09, prospecção B2B de lojistas por interesse legítimo")}
          value={politica.legal_basis_ref ?? ""}
          onChange={(e) => onChange({ ...politica, legal_basis_ref: e.target.value })}
        />
        <p className="text-xs text-text-muted">
          {t("Obrigatória para publicar. Fica registrada no contato quando ele entra na cadência.")}
        </p>
      </section>
    </div>
  );
}
