"use client";

import { useId, useState } from "react";

import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";
import { AbaNegocios } from "@/components/inbox/painel/AbaNegocios";
import { QuandoFazer } from "@/components/inbox/painel/QuandoFazer";
import { SeletorDeDataHora } from "@/components/inbox/painel/SeletorDeDataHora";
import { useT } from "@/hooks/i18n/useT";
import { conversaDaVitrine } from "@/lib/design-system/amostras/conversa";
import { IDS } from "@/lib/design-system/amostras/ids";
import { leadDaVitrine } from "@/lib/design-system/amostras/painel";

import { Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

/** O painel do lead em tamanho real (352 px), com altura fixa para caber na página. */
function Painel({ semTarefa }: { semTarefa: boolean }) {
  const [agora] = useState(() => Date.now());
  const [conversa] = useState(() => conversaDaVitrine(agora, { semTarefa }));
  return (
    <div className="h-[42rem] w-88 shrink-0 overflow-hidden rounded-lg border border-border">
      <CRMSidePanel conversation={conversa} />
    </div>
  );
}

function SeletorDeData({ tema }: { tema: Tema }) {
  const t = useT();
  const rotulo = useId();
  const [prazo, setPrazo] = useState<Date | null>(null);
  return (
    <Secao id={`seletor-${tema}`} sub titulo={t("Seletor de data e horário")} mapa="ds:seletor-de-data" tema={tema}>
      <Exemplo nome={t("Atalhos e calendário (os da tarefa)")} mapa="ds:seletor-de-data" tema={tema}>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex w-80 flex-col gap-2">
            <span id={rotulo} className="text-label font-bold text-text-muted">
              {t("Quando fazer")}
            </span>
            <QuandoFazer rotulo={rotulo} onEscolher={setPrazo} />
          </div>
          <div className="w-80">
            <SeletorDeDataHora valor={prazo} onEscolher={setPrazo} />
          </div>
        </div>
      </Exemplo>
    </Secao>
  );
}

function Negocio({ tema }: { tema: Tema }) {
  const t = useT();
  const [agora] = useState(() => Date.now());
  const [leads] = useState(() => [leadDaVitrine(agora)]);
  const [ativo, setAtivo] = useState<string | null>(null);
  return (
    <Secao
      id={`negocio-${tema}`}
      sub
      titulo={t("Negócio (aba Negócios)")}
      mapa="ds:negocio"
      tema={tema}
      apoio={t("Etapas clicáveis, Ganho, Perdido com motivo e Outro funil no próprio painel; excluir fica no menu \"…\" do lead.")}
    >
      <div className="w-88 rounded-lg border border-border bg-surface p-4">
        <AbaNegocios
          contactId={IDS.contato}
          leads={leads}
          orders={[]}
          carregando={false}
          erro={false}
          leitura={false}
          leadAtivoId={ativo}
          onSelecionarLead={setAtivo}
          recarregar={() => undefined}
        />
      </div>
    </Secao>
  );
}

export function SecaoColunaDoLead({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao
      id={`lead-${tema}`}
      titulo={t("Coluna do lead")}
      mapa="ds:coluna-do-lead"
      tema={tema}
      apoio={t("Quatro abas (Resumo, Negócios, Empresa, Atividade). O Resumo responde ao pedido de quem atende: Próximo passo como tarefa de verdade, Detalhes do contato editáveis no lugar e Obs.")}
    >
      <Exemplo nome={t("Com tarefa atrasada, e sem próximo passo")} mapa="ds:coluna-do-lead" tema={tema}>
        <div className="flex flex-wrap gap-6">
          <Painel semTarefa={false} />
          <Painel semTarefa />
        </div>
      </Exemplo>
      <SeletorDeData tema={tema} />
      <Negocio tema={tema} />
    </Secao>
  );
}
