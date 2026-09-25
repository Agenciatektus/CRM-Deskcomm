"use client";
import { useId, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MAX_ETAPAS_DE_SAIDA,
  MAX_ETIQUETAS_DE_SAIDA,
  normalizarEtiqueta,
  type SaidasDaCadencia,
} from "@/lib/cadencia/saidas";
import { cn } from "@/lib/utils";

interface Etapa {
  id: string;
  name: string;
}

/** "Reunião agendada, Não perturbe" → etiquetas únicas, na caixa em que foram escritas. */
function lerEtiquetas(texto: string): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const parte of texto.split(",")) {
    const tag = parte.trim();
    if (!tag || vistas.has(normalizarEtiqueta(tag))) continue;
    vistas.add(normalizarEtiqueta(tag));
    saida.push(tag.slice(0, 60));
  }
  return saida.slice(0, MAX_ETIQUETAS_DE_SAIDA);
}

/**
 * QUANDO A CADÊNCIA PARA — além da resposta do lead, que sempre encerra.
 *
 * Mora ao lado da política de envio porque é política também: muda o que sai
 * sem mexer nos passos, e vale na hora (a checagem antes de cada envio lê o
 * valor atual, não o da publicação).
 */
export function SaidasDaCadenciaEditor({
  saidas,
  onChange,
  etapas,
}: {
  saidas: SaidasDaCadencia;
  onChange: (s: SaidasDaCadencia) => void;
  etapas: Etapa[];
}) {
  const t = useT();
  const idEtiquetas = useId();
  const [textoEtiquetas, setTextoEtiquetas] = useState(saidas.etiquetas.join(", "));

  function alternarEtapa(id: string) {
    const tem = saidas.etapas.includes(id);
    if (!tem && saidas.etapas.length >= MAX_ETAPAS_DE_SAIDA) return;
    onChange({ ...saidas, etapas: tem ? saidas.etapas.filter((e) => e !== id) : [...saidas.etapas, id] });
  }

  return (
    <div className="space-y-4" data-testid="saidas-da-cadencia">
      <p className="text-xs text-text-muted">{t("Quando o lead responde, a cadência para sempre.")}</p>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${idEtiquetas}-fechar`} className="text-sm font-normal">
          {t("Negócio ganho ou perdido")}
        </Label>
        <Switch
          id={`${idEtiquetas}-fechar`}
          checked={saidas.ao_fechar}
          onCheckedChange={(v) => onChange({ ...saidas, ao_fechar: v })}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${idEtiquetas}-humano`} className="text-sm font-normal">
          {t("Alguém do time mandou mensagem ao lead")}
        </Label>
        <Switch
          id={`${idEtiquetas}-humano`}
          checked={saidas.humano_assumir}
          onCheckedChange={(v) => onChange({ ...saidas, humano_assumir: v })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={idEtiquetas}>{t("Quando o lead ganhar a etiqueta")}</Label>
        <Input
          id={idEtiquetas}
          value={textoEtiquetas}
          placeholder={t("Ex.: Reunião agendada, Não perturbe")}
          onChange={(e) => setTextoEtiquetas(e.target.value)}
          onBlur={() => {
            const lidas = lerEtiquetas(textoEtiquetas);
            setTextoEtiquetas(lidas.join(", "));
            onChange({ ...saidas, etiquetas: lidas });
          }}
        />
        <p className="text-xs text-text-muted">{t("Separe por vírgula. Vale etiqueta do negócio ou do contato.")}</p>
      </div>

      {etapas.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("Quando o negócio entrar na etapa")}</span>
          <div className="flex flex-wrap gap-1.5">
            {etapas.map((e) => {
              const ligado = saidas.etapas.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => alternarEtapa(e.id)}
                  className={cn(
                    "h-8 rounded-md border px-2 text-xs transition-colors",
                    ligado
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-text-muted hover:bg-muted",
                  )}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
