"use client";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import {
  DESCRICAO_DA_VARIAVEL,
  MAX_VARIACOES_EXTRAS,
  VARIANTE_TAMANHO_MAXIMO,
  VARIAVEIS_DA_CAMPANHA,
} from "@/lib/campanhas/renderizador";
import { Plus, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** O teto do `message_body` no banco (0375). Variação extra para em 1.000. */
const CORPO_TAMANHO_MAXIMO = 4096;

/**
 * A MENSAGEM DA CAMPANHA — o corpo e as variações da mesma abordagem.
 *
 * `variantes[0]` é o `message_body`: o texto que toda campanha tem, com o teto
 * de 4.096 da coluna. As demais são as EXTRAS (até cinco, 1.000 cada), e cada
 * contato recebe UMA, escolhida por ele — a mesma pessoa, a mesma variação,
 * inclusive se a lista for preparada de novo.
 *
 * Mora em `components/` e não dentro de uma das duas telas porque criar e editar
 * campanha pedem a MESMA caixa: duplicada, a aba de variação nasceria numa só, e
 * a outra ficaria editando `message_variants` sem saber que ele existe.
 *
 * Desenho igual ao `PassoMensagem` da cadência de propósito — quem aprendeu lá
 * não reaprende aqui.
 */
export function MensagemDaCampanha({
  variantes,
  onChange,
}: {
  variantes: string[];
  onChange: (variantes: string[]) => void;
}) {
  const t = useT();
  const [ativa, setAtiva] = useState(0);
  const campo = useRef<HTMLTextAreaElement | null>(null);
  // Onde o cursor ESTAVA. Clicar no botão da variável tira o foco do texto; sem
  // esta memória, quem nunca clicou no campo veria a variável ir para o COMEÇO.
  const cursor = useRef<{ inicio: number; fim: number } | null>(null);

  const lista = variantes.length > 0 ? variantes : [""];
  const indice = Math.min(ativa, lista.length - 1);
  const texto = lista[indice] ?? "";
  const teto = indice === 0 ? CORPO_TAMANHO_MAXIMO : VARIANTE_TAMANHO_MAXIMO;

  const trocar = (novo: string) => onChange(lista.map((v, i) => (i === indice ? novo : v)));

  const inserirVariavel = (nome: string) => {
    const el = campo.current;
    const marcador = `{{${nome}}}`;
    const inicio = Math.min(cursor.current?.inicio ?? texto.length, texto.length);
    const fim = Math.min(cursor.current?.fim ?? texto.length, texto.length);
    trocar(texto.slice(0, inicio) + marcador + texto.slice(fim));
    cursor.current = { inicio: inicio + marcador.length, fim: inicio + marcador.length };
    requestAnimationFrame(() => el?.focus());
  };

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-1"
        role="tablist"
        aria-label={t("Variações da mensagem")}
      >
        {lista.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === indice}
            onClick={() => {
              setAtiva(i);
              cursor.current = null;
            }}
            className={cn(
              "h-8 rounded-md px-2.5 text-xs transition-colors",
              i === indice ? "bg-muted font-medium text-text" : "text-text-muted hover:bg-muted/60",
            )}
          >
            {t("Variação")} {i + 1}
          </button>
        ))}
        {lista.length < MAX_VARIACOES_EXTRAS + 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              onChange([...lista, ""]);
              setAtiva(lista.length);
            }}
          >
            <Plus size={14} className="mr-1" aria-hidden /> {t("Variação")}
          </Button>
        )}
      </div>

      <Textarea
        ref={campo}
        rows={6}
        maxLength={teto}
        value={texto}
        aria-label={indice === 0 ? t("Texto da mensagem") : `${t("Texto da variação")} ${indice + 1}`}
        placeholder={t("Escreva como você falaria com uma pessoa só.")}
        onChange={(e) => trocar(e.target.value)}
        onSelect={(e) =>
          (cursor.current = { inicio: e.currentTarget.selectionStart, fim: e.currentTarget.selectionEnd })
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-text-muted">{t("Inserir:")}</span>
        {VARIAVEIS_DA_CAMPANHA.map((v) => (
          <button
            key={v}
            type="button"
            title={t(DESCRICAO_DA_VARIAVEL[v])}
            onClick={() => inserirVariavel(v)}
            className="h-7 rounded-md border border-border px-2 font-mono text-xs text-text-muted transition-colors hover:bg-muted hover:text-text"
          >
            {`{{${v}}}`}
          </button>
        ))}
        <span className="ml-auto text-xs tabular-nums text-text-muted">
          {texto.length}/{teto}
        </span>
        {/* Só as EXTRAS saem: apagar a variação 1 apagaria o `message_body`, que
            é o texto que a campanha tem de ter. */}
        {indice > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-text-muted"
            onClick={() => {
              onChange(lista.filter((_, i) => i !== indice));
              setAtiva(Math.max(0, indice - 1));
            }}
          >
            <Trash size={14} className="mr-1" aria-hidden /> {t("Remover variação")}
          </Button>
        )}
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <ul className="space-y-1">
          {VARIAVEIS_DA_CAMPANHA.map((v) => (
            <li key={v}>
              <span className="rounded-md bg-surface-elevated px-1 font-mono text-xs">
                {`{{${v}}}`}
              </span>{" "}
              — {t(DESCRICAO_DA_VARIAVEL[v])}
            </li>
          ))}
        </ul>
        <p className="text-xs">
          {t("Use {a|b} para alternar palavras. Cada contato recebe sempre a mesma variação.")}
        </p>
        <p>
          {t(
            "Quem não tiver o dado que a mensagem usa fica de fora, com o motivo na lista — mensagem com buraco não sai.",
          )}
        </p>
      </div>
    </div>
  );
}
