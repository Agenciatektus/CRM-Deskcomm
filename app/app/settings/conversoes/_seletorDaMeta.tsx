"use client";

/**
 * Lista para escolher o pixel ou a Página, no lugar de digitar o id (o erro nº 1
 * desta integração). Quem monta o seletor passa o campo manual como `children`:
 * ele aparece quando o operador escolhe "Digitar o ID manualmente", quando a
 * lista não carrega ou vem vazia, e quando o id já gravado não está na lista.
 * Sem conexão de leitura este componente nem é montado (ver `leituraConectada`).
 */
import { useState, type ReactNode } from "react";

import { Escolha } from "@/components/ui/escolha";
import { traduzir } from "@/lib/i18n/traducao";
import type { Idioma } from "@/lib/i18n/idiomas";
import type { OpcaoDaMeta } from "@/lib/plataformas-de-anuncio/meta/insights";

const MANUAL = "__manual__";

export function SeletorDaMeta({
  id,
  idioma,
  rotulo,
  valor,
  onValor,
  opcoes,
  carregando,
  erro,
  children,
}: {
  id: string;
  idioma: Idioma;
  rotulo: string;
  valor: string;
  onValor: (v: string) => void;
  opcoes: OpcaoDaMeta[] | undefined;
  carregando: boolean;
  erro: boolean;
  children: ReactNode;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const [manual, setManual] = useState(false);

  if (carregando) {
    return <p className="text-xs text-muted-foreground">{t("Carregando a lista da Meta…")}</p>;
  }
  if (erro) {
    return (
      <>
        <p className="text-xs text-destructive">
          {t("Não consegui carregar a lista da Meta agora. Digite o ID manualmente.")}
        </p>
        {children}
      </>
    );
  }
  const lista = opcoes ?? [];
  if (lista.length === 0) {
    return (
      <>
        <p className="text-xs text-muted-foreground">
          {t("A Meta não devolveu nenhuma opção para esta conta. Digite o ID manualmente.")}
        </p>
        {children}
      </>
    );
  }

  const forasDaLista = valor !== "" && !lista.some((o) => o.id === valor);
  const mostrarManual = manual || forasDaLista;

  return (
    <>
      <Escolha
        id={id}
        aria-label={rotulo}
        value={mostrarManual ? MANUAL : valor}
        onValueChange={(v) => {
          if (v === MANUAL) {
            setManual(true);
            return;
          }
          setManual(false);
          onValor(v);
        }}
        placeholder={t("Escolha na lista")}
        opcoes={[
          ...lista.map((o) => ({ value: o.id, label: `${o.nome} (${o.id})` })),
          { value: MANUAL, label: t("Digitar o ID manualmente") },
        ]}
      />
      {mostrarManual && children}
    </>
  );
}
