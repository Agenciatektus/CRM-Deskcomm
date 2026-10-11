"use client";

import type { ReactNode } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import { Exemplo } from "../_componentes/Secao";
import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

function Linha({ papel, medida, classe, children }: { papel: string; medida: string; classe: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-baseline gap-1 border-t border-border py-2 first:border-t-0 md:grid-cols-[10rem_minmax(0,1fr)_9rem] md:gap-4">
      <span className="text-meta text-text-subtle">{papel}</span>
      <span className={cn("min-w-0 truncate", classe)}>{children}</span>
      <code className="text-meta text-text-subtle md:text-right">{medida}</code>
    </div>
  );
}

export function SecaoTipografia({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao
      id={`tipo-${tema}`}
      titulo={t("Tipografia")}
      apoio={t("A escala do protótipo virou token (text-meta, text-label, text-ui, text-message, text-title-*). As telas ainda usam a escala do Tailwind, mostrada no fim.")}
    >
      <Exemplo nome={t("Escala do protótipo, em tokens")} mapa="tipo:escala" tema={tema}>
        <div className="flex flex-col">
          <Linha papel={t("Título de página")} medida="title-lg · 20/700" classe="text-title-lg font-bold tracking-tight">
            Inbox
          </Linha>
          <Linha papel={t("Nome no painel")} medida="title-md · 17/700" classe="text-title-md font-bold">
            Mariana Couto
          </Linha>
          <Linha papel={t("Nome no cabeçalho")} medida="title-sm · 16/700" classe="text-title-sm font-bold">
            Mariana Couto
          </Linha>
          <Linha papel={t("Mensagem")} medida="message · 15/400/1.42" classe="text-message">
            {t("Oi! Ainda tem horário no sábado de manhã?")}
          </Linha>
          <Linha papel={t("Texto de interface")} medida="ui · 14/400/1.45" classe="text-ui">
            {t("Ao assumir, o automático para nesta conversa.")}
          </Linha>
          <Linha papel={t("Rótulo, botão")} medida="label · 13/600" classe="text-label font-semibold">
            {t("Sugerir resposta")}
          </Linha>
          <Linha papel={t("Meta")} medida="meta · 12/600" classe="text-meta font-semibold text-text-subtle">
            {t("Esperando há")} 14 min
          </Linha>
          <Linha papel={t("Rótulo da 1ª coluna")} medida="rail · 10.5/600" classe="text-rail font-semibold">
            {t("Atendimento")}
          </Linha>
        </div>
      </Exemplo>
      <Exemplo nome={t("Família e números (mono)")} mapa="tipo:mono" tema={tema}>
        <div className="flex flex-col gap-1">
          <span className="text-ui">{t("Família de texto: a variável --font-atkinson do CRM.")}</span>
          <span className="font-mono text-ui tabular-nums">+55 11 98472-3310 · R$ 4.800,00 · 14:02</span>
        </div>
      </Exemplo>
      <Exemplo nome={t("Pesos")} mapa="tipo:pesos" tema={tema}>
        <div className="flex flex-wrap gap-4 text-ui">
          <span className="font-normal">400 Aa</span>
          <span className="font-medium">500 Aa</span>
          <span className="font-semibold">600 Aa</span>
          <span className="font-bold">700 Aa</span>
        </div>
        <p className="text-meta text-text-subtle">
          {t("O CRM embarca a fonte só em 400 e 700: 500 e 600 são aproximados pelo navegador.")}
        </p>
      </Exemplo>
      <Exemplo nome={t("Escala usada nas telas hoje")} mapa="tipo:familia" tema={tema}>
        <div className="flex flex-col">
          <Linha papel="text-2xl · 600" medida="24px" classe="text-2xl font-semibold tracking-tight">
            Inbox
          </Linha>
          <Linha papel="text-sm" medida="14px" classe="text-sm">
            {t("Ao assumir, o automático para nesta conversa.")}
          </Linha>
          <Linha papel="text-xs" medida="12px" classe="text-xs text-text-muted">
            {t("Esperando há")} 14 min
          </Linha>
        </div>
      </Exemplo>
    </Secao>
  );
}
