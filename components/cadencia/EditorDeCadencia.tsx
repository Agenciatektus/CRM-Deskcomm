"use client";
import Link from "next/link";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import {
  useCadencia,
  useDesligarCadencia,
  usePublicarCadencia,
  useSalvarCadencia,
  type CadenciaDetalhe,
  type ErroDePublicacao,
  type GatilhoDaCadencia,
  type PoliticaDaCadencia,
} from "@/hooks/cadencia/useCadencias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/types";
import { CADENCE_SETTINGS_PADRAO } from "@/lib/cadencia/settings";
import { grafoDaTimeline, timelineDoGrafo, type PassoDaCadencia } from "@/lib/cadencia/timeline";
import { ListaDePassos } from "./ListaDePassos";
import { PoliticaDeEnvio } from "./PoliticaDeEnvio";
import { SaidasDaCadenciaEditor } from "./SaidasDaCadencia";
import { GatilhoDaCadenciaEditor } from "./GatilhoDaCadencia";
import { SAIDAS_PADRAO } from "@/lib/cadencia/saidas";
import { PreviewDaMensagem } from "./PreviewDaMensagem";

interface Etapa {
  id: string;
  name: string;
  is_lost?: boolean;
}

/**
 * EDITOR DE UMA CADÊNCIA — gatilho no topo, régua no meio, política ao lado.
 *
 * O rascunho só vai ao motor quando PUBLICADO (a versão publicada é imutável): o
 * que se edita aqui é o `draft_graph`. "Publicar" salva e publica em seguida — e
 * os motivos de recusa da publicação aparecem na tela, um por linha, porque são
 * exatamente o que falta para a régua enviar.
 */
export function EditorDeCadencia({
  cadenciaId,
  pipelineId,
  etapas,
  leads,
  onFechar,
}: {
  cadenciaId: string;
  pipelineId: string;
  etapas: Etapa[];
  leads: Array<{ id: string; title: string }>;
  onFechar: () => void;
}) {
  const t = useT();
  const { data, isLoading, isError } = useCadencia(cadenciaId);
  if (isLoading) return <p className="p-4 text-sm text-text-muted">{t("Carregando a cadência…")}</p>;
  if (isError || !data) return <p className="p-4 text-sm text-destructive">{t("Não foi possível abrir a cadência.")}</p>;
  return (
    <Formulario
      key={data.updated_at}
      cadencia={data}
      pipelineId={pipelineId}
      etapas={etapas}
      leads={leads}
      onFechar={onFechar}
    />
  );
}

function Formulario({
  cadencia,
  pipelineId,
  etapas,
  leads,
  onFechar,
}: {
  cadencia: CadenciaDetalhe;
  pipelineId: string;
  etapas: Etapa[];
  leads: Array<{ id: string; title: string }>;
  onFechar: () => void;
}) {
  const t = useT();
  const salvar = useSalvarCadencia(cadencia.id, pipelineId);
  const publicar = usePublicarCadencia(cadencia.id, pipelineId);
  const desligar = useDesligarCadencia(cadencia.id, pipelineId);

  const passosIniciais = timelineDoGrafo(cadencia.draft_graph ?? cadencia.grafo_no_ar);
  const [nome, setNome] = useState(cadencia.name);
  const [passos, setPassos] = useState<PassoDaCadencia[]>(passosIniciais ?? []);
  const [gatilho, setGatilho] = useState<GatilhoDaCadencia>(cadencia.trigger_config ?? { kind: "manual", cancel_on_reply: true });
  const [politica, setPolitica] = useState<PoliticaDaCadencia>(cadencia.cadence_settings ?? CADENCE_SETTINGS_PADRAO);
  const [numero, setNumero] = useState<string | null>(cadencia.channel_session_id);
  const [erros, setErros] = useState<ErroDePublicacao[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const noAr = cadencia.status === "active";

  if (passosIniciais === null) {
    return (
      <div className="space-y-2 p-4 text-sm">
        <p>{t("Esta cadência tem ramificações que o editor em lista não mostra.")}</p>
        <Link className="text-primary underline" href={`/app/ai/followups/${cadencia.id}`}>
          {t("Abrir no editor avançado")}
        </Link>
      </div>
    );
  }

  const mudancas = () => ({
    name: nome.trim(),
    draft_graph: grafoDaTimeline(passos),
    // A cadência PARA na resposta do lead — é o que protege o número.
    trigger_config: { ...gatilho, cancel_on_reply: true } as GatilhoDaCadencia,
    cadence_settings: politica,
    ...(numero && numero !== cadencia.channel_session_id ? { channel_session_id: numero } : {}),
  });

  const aoSalvar = async (depois?: "publicar") => {
    setErros([]);
    setAviso(null);
    try {
      await salvar.mutateAsync(mudancas());
      if (depois === "publicar") {
        await publicar.mutateAsync();
        setAviso(t("Cadência publicada."));
      } else {
        setAviso(t("Rascunho salvo."));
      }
    } catch (err) {
      const lista = err instanceof ApiError ? (err.details?.errors as ErroDePublicacao[] | undefined) : undefined;
      if (lista && lista.length > 0) setErros(lista);
      else setAviso(err instanceof Error ? err.message : t("Não foi possível salvar."));
    }
  };

  const ocupado = salvar.isPending || publicar.isPending || desligar.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="cadencia-nome">{t("Nome da cadência")}</Label>
          <Input id="cadencia-nome" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>

        <GatilhoDaCadenciaEditor gatilho={gatilho} onChange={setGatilho} etapas={etapas} />

        <div className="space-y-2">
          <span className="text-sm font-medium">{t("Passos")}</span>
          <ListaDePassos
            passos={passos}
            onChange={setPassos}
            etapas={etapas}
            renderPreview={(variantes) => (
              <PreviewDaMensagem cadenciaId={cadencia.id} leads={leads} variantes={variantes} />
            )}
          />
        </div>

        {erros.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">
            {erros.map((e, i) => (
              <li key={`${e.code}-${i}`}>{e.message}</li>
            ))}
          </ul>
        )}
        {aviso && (
          <p className="text-sm text-text-muted" role="status">
            {aviso}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={ocupado} onClick={() => void aoSalvar("publicar")}>
            {noAr ? t("Salvar e republicar") : t("Publicar")}
          </Button>
          <Button type="button" variant="outline" disabled={ocupado} onClick={() => void aoSalvar()}>
            {t("Salvar rascunho")}
          </Button>
          {noAr && (
            <Button type="button" variant="outline" disabled={ocupado} onClick={() => desligar.mutate()}>
              {t("Desligar")}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onFechar}>
            {t("Voltar")}
          </Button>
        </div>
      </div>

      <aside className="space-y-2 lg:border-l lg:border-border lg:pl-6">
        <span className="text-sm font-medium">{t("Política de envio")}</span>
        <PoliticaDeEnvio
          politica={politica}
          onChange={setPolitica}
          channelSessionId={numero}
          onChangeNumero={setNumero}
          numeroTravado={noAr}
        />
        <div className="space-y-2 border-t border-border pt-4">
          <span className="text-sm font-medium">{t("Quando a cadência para")}</span>
          <SaidasDaCadenciaEditor
            saidas={politica.saidas ?? SAIDAS_PADRAO}
            onChange={(saidas) => setPolitica({ ...politica, saidas })}
            etapas={etapas.filter((e) => !e.is_lost)}
          />
        </div>
      </aside>
    </div>
  );
}
