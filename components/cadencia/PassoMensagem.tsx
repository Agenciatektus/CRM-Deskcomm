"use client";
import { useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VARIANTE_TAMANHO_MAXIMO, VARIAVEIS_DA_CADENCIA } from "@/lib/cadencia/render";
import { Plus, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Até 10 variações por passo: o motor escolhe uma por lead, sempre a mesma. */
const MAX_VARIANTES = 10;

/**
 * UM PASSO "ENVIAR WHATSAPP" — as variações do mesmo texto.
 *
 * Cada lead recebe UMA variação, escolhida por ele (não por sorteio a cada
 * tentativa): o preview mostra o que sai, e o anti-repetição do número não vê o
 * mesmo texto 100 vezes. Variável com fallback — `{{primeiro_nome|tudo bem}}` —
 * é o jeito de a régua não travar em cadastro sem nome.
 */
export function PassoMensagem({
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
  const indice = Math.min(ativa, variantes.length - 1);
  const texto = variantes[indice] ?? "";

  const trocar = (novoTexto: string) => onChange(variantes.map((v, i) => (i === indice ? novoTexto : v)));

  const inserirVariavel = (nome: string) => {
    const el = campo.current;
    const marcador = nome === "primeiro_nome" ? `{{${nome}|tudo bem}}` : `{{${nome}}}`;
    const inicio = Math.min(cursor.current?.inicio ?? texto.length, texto.length);
    const fim = Math.min(cursor.current?.fim ?? texto.length, texto.length);
    trocar(texto.slice(0, inicio) + marcador + texto.slice(fim));
    cursor.current = { inicio: inicio + marcador.length, fim: inicio + marcador.length };
    requestAnimationFrame(() => el?.focus());
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t("Variações da mensagem")}>
        {variantes.map((_, i) => (
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
        {variantes.length < MAX_VARIANTES && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              onChange([...variantes, ""]);
              setAtiva(variantes.length);
            }}
          >
            <Plus size={14} className="mr-1" aria-hidden /> {t("Variação")}
          </Button>
        )}
      </div>

      <Textarea
        ref={campo}
        rows={4}
        maxLength={VARIANTE_TAMANHO_MAXIMO}
        value={texto}
        aria-label={`${t("Texto da variação")} ${indice + 1}`}
        placeholder={t("Oi {{primeiro_nome|tudo bem}}! {Vi|Conheci} a {{empresa}} e …")}
        onChange={(e) => trocar(e.target.value)}
        onSelect={(e) =>
          (cursor.current = { inicio: e.currentTarget.selectionStart, fim: e.currentTarget.selectionEnd })
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-text-muted">{t("Inserir:")}</span>
        {VARIAVEIS_DA_CADENCIA.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => inserirVariavel(v)}
            className="h-7 rounded-md border border-border px-2 font-mono text-xs text-text-muted transition-colors hover:bg-muted hover:text-text"
          >
            {`{{${v}}}`}
          </button>
        ))}
        <span className="ml-auto text-xs tabular-nums text-text-muted">
          {texto.length}/{VARIANTE_TAMANHO_MAXIMO}
        </span>
        {variantes.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-text-muted"
            onClick={() => {
              onChange(variantes.filter((_, i) => i !== indice));
              setAtiva(Math.max(0, indice - 1));
            }}
          >
            <Trash size={14} className="mr-1" aria-hidden /> {t("Remover variação")}
          </Button>
        )}
      </div>
      <p className="text-xs text-text-muted">
        {t("Use {a|b} para alternar palavras. Cada lead recebe sempre a mesma variação.")}
      </p>
    </div>
  );
}
