"use client";

import { useState } from "react";

import { classesDaBolha, TEXTO_ACCENT, type TomDaBolha } from "@/components/inbox/bolha/estilo";
import { NoteCard } from "@/components/inbox/NoteCard";
import { useT } from "@/hooks/i18n/useT";
import type { IdDoMapa } from "@/lib/design-system/mapa";
import type { Note } from "@/lib/types/messaging";
import { cn } from "@/lib/utils";

import { RefDoPrototipo, SeloDoMapa } from "../_componentes/SeloDoMapa";
import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

/** Uma bolha com as classes de VERDADE do fio (`classesDaBolha`, bolha/estilo.ts). */
function Bolha({ tom, saida, inicio = true, children }: { tom: TomDaBolha; saida: boolean; inicio?: boolean; children: string }) {
  return (
    <div className={cn("flex max-w-[80%] flex-col", saida ? "items-end self-end" : "items-start self-start")}>
      <div className={classesDaBolha({ tom, saida, inicio, falhou: false, busca: false, temMenu: false, modoMeta: "abaixo" })}>
        {children}
      </div>
    </div>
  );
}

function Marca({ id, tema }: { id: IdDoMapa; tema: Tema }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SeloDoMapa id={id} tema={tema} />
      <RefDoPrototipo id={id} />
    </div>
  );
}

export function SecaoBolhas({ tema }: { tema: Tema }) {
  const t = useT();
  const [nota] = useState<Note>(() => ({
    id: "nota-ds",
    conversation_id: "conversa-ds",
    body: t("Cliente prefere contato à tarde."),
    created_by_user_id: null,
    created_by_name: "Ana",
    created_at: new Date().toISOString(),
    media_storage_path: null,
    media_mime: null,
    media_size_bytes: null,
  }));

  return (
    <Secao id={`bolhas-${tema}`} titulo={t("Bolhas de mensagem")}>
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4 fundo-do-fio">
        {/* O divisor de dia e o de novas mensagens são marcação inline de
            fio/ConteudoDaLinha.tsx (sem componente próprio); aqui vão as mesmas
            classes, e a Etapa 2 extrai os dois para componente. */}
        <div className="flex justify-center">
          <span className="pele-dia rounded-full border border-border bg-surface px-3 py-0.5 text-xs font-semibold text-text-muted shadow-xs">
            {t("Hoje")}
          </span>
        </div>
        <Marca id="bolha:dia" tema={tema} />

        <Bolha tom="entrada" saida={false}>{t("Oi! Ainda tem horário no sábado de manhã?")}</Bolha>
        <Bolha tom="entrada" saida={false} inicio={false}>{t("Pode ser às 10h?")}</Bolha>
        <Marca id="bolha:entrada" tema={tema} />

        <div className="flex items-center gap-3 text-xs font-bold text-accent-700 dark:text-accent-300">
          <span aria-hidden className="h-px flex-1 bg-accent/35" />
          <span>{t("Novas mensagens")}</span>
          <span aria-hidden className="h-px flex-1 bg-accent/35" />
        </div>

        <div className="flex flex-col items-end gap-1 self-end">
          <span className={cn("mx-2 text-xs font-semibold", TEXTO_ACCENT)}>{t("IA")}</span>
        </div>
        <Bolha tom="ia" saida>{t("Tenho sim! Às 10h está livre. Posso confirmar?")}</Bolha>
        <Marca id="bolha:ia" tema={tema} />

        <Bolha tom="saida" saida>{t("Confirmado, Mariana. Até sábado!")}</Bolha>
        <Bolha tom="saida" saida inicio={false}>{t("Qualquer coisa, é só chamar.")}</Bolha>
        <Marca id="bolha:saida" tema={tema} />

        <Bolha tom="apagada" saida={false}>{t("Mensagem apagada")}</Bolha>

        <NoteCard note={nota} />
        <Marca id="bolha:nota" tema={tema} />
      </div>
    </Secao>
  );
}
