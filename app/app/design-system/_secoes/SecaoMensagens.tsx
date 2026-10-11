"use client";

import { DivisorDeNovas, DivisorDoDia } from "@/components/inbox/fio/Divisores";
import { useState, type ReactNode } from "react";

import { MessageBubble } from "@/components/inbox/MessageBubble";
import { NoteCard } from "@/components/inbox/NoteCard";
import { PassagemCard } from "@/components/inbox/PassagemCard";
import { useT } from "@/hooks/i18n/useT";
import { notaDaVitrine, passagemDaVitrine } from "@/lib/design-system/amostras/conversa";
import { IDS } from "@/lib/design-system/amostras/ids";
import { mensagensDaVitrine } from "@/lib/design-system/amostras/mensagens";

import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";
import { useMidiaDeExemplo } from "../_componentes/useMidiaDeExemplo";

/** O nome do tipo, discreto, acima da bolha: é o que se procura ao revisar. */
function Tipo({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-4 text-meta font-semibold uppercase tracking-wider text-text-subtle">{nome}</span>
      {children}
    </div>
  );
}

/** Os marcadores do fio, com os mesmos componentes que a Inbox usa. */
function Divisores({ dia, novas }: { dia: string; novas: number }) {
  return (
    <>
      <DivisorDoDia rotulo={dia} />
      <DivisorDeNovas quantas={novas} />
    </>
  );
}

export function SecaoMensagens({ tema }: { tema: Tema }) {
  const t = useT();
  const [agora] = useState(() => Date.now());
  const midia = useMidiaDeExemplo();
  const m = mensagensDaVitrine(agora, midia);
  const [passagem] = useState(() => passagemDaVitrine(agora));
  const [nota] = useState(() => notaDaVitrine(agora, t("Ligar quinta às 10h se não voltar.")));
  const nada = () => undefined;

  return (
    <Secao
      id={`mensagens-${tema}`}
      titulo={t("Mensagens")}
      mapa="ds:mensagens"
      tema={tema}
      apoio={t("Mensagens seguidas da mesma pessoa se agrupam: cantos de 6 px no lado de quem enviou e nome só na primeira. Horário e status ficam no canto, na linha do texto quando cabe.")}
    >
      <Secao id={`tipos-${tema}`} sub titulo={t("Tipos cobertos (os mesmos que o CRM já suporta)")} mapa="ds:tipos" tema={tema}>
        <div className="fundo-do-fio overflow-hidden rounded-lg border border-border">
          <div className="trama-do-fio flex flex-col gap-3 py-4">
            <Divisores dia={t("Hoje")} novas={2} />
            <Tipo nome={t("Texto")}>
              <MessageBubble message={m.texto} onResponder={nada} />
            </Tipo>
            {midia.imagem ? (
              <Tipo nome={t("Imagem com legenda")}>
                <MessageBubble message={m.imagem} />
              </Tipo>
            ) : null}
            <Tipo nome={t("Resposta da IA")}>
              <MessageBubble message={m.ia} viewerUserId={IDS.atendente} />
            </Tipo>
            {midia.audio ? (
              <Tipo nome={t("Áudio com transcrição")}>
                <MessageBubble message={m.audio} />
              </Tipo>
            ) : null}
            {/* Só com o arquivo pronto: sem fonte, a bolha de vídeo pediria a mídia ao servidor. */}
            {midia.video ? (
              <Tipo nome={t("Vídeo")}>
                <MessageBubble message={m.video} />
              </Tipo>
            ) : null}
            {midia.figurinha ? (
              <Tipo nome={t("Figurinha")}>
                <MessageBubble message={m.figurinha} />
              </Tipo>
            ) : null}
            <Tipo nome={t("Documento")}>
              <MessageBubble message={m.documento} viewerUserId={IDS.atendente} />
            </Tipo>
            <Tipo nome={t("Localização")}>
              <MessageBubble message={m.localizacao} />
            </Tipo>
            <Tipo nome={t("Contato")}>
              <MessageBubble message={m.contato} />
            </Tipo>
            <Tipo nome={t("Reação")}>
              <MessageBubble message={m.reacao} />
            </Tipo>
            <Tipo nome={t("Citação")}>
              <MessageBubble message={m.citacao} citada={m.texto} viewerUserId={IDS.atendente} />
            </Tipo>
            <Tipo nome={t("Editada")}>
              <MessageBubble message={m.editada} viewerUserId={IDS.atendente} />
            </Tipo>
            <Tipo nome={t("Apagada")}>
              <MessageBubble message={m.apagada} />
            </Tipo>
            <Tipo nome={t("Não suportada")}>
              <MessageBubble message={m["nao-suportada"]} />
            </Tipo>
            <Tipo nome={t("Falhou, com Tentar de novo")}>
              <MessageBubble message={m.falhou} viewerUserId={IDS.atendente} onReenviar={nada} />
            </Tipo>
            <Tipo nome={t("Nota interna")}>
              <NoteCard note={nota} />
            </Tipo>
            {passagem ? (
              <Tipo nome={t("Passagem da IA")}>
                <div className="px-4">
                  <PassagemCard cartao={passagem} contatoId={IDS.contato} onAssumir={nada} assumindo={false} />
                </div>
              </Tipo>
            ) : null}
          </div>
        </div>
        <p className="text-meta text-text-subtle">
          {t("Imagem, figurinha, áudio e vídeo são gerados no navegador: nenhum arquivo é baixado.")}
        </p>
      </Secao>
    </Secao>
  );
}
