"use client";

import { useT } from "@/hooks/i18n/useT";
import type { Message } from "@/lib/types/messaging";
import { Question } from "@/lib/ui/icons";

/**
 * O tipo que o canal não soube ler, para o aviso. Vem de fora (metadata), então
 * só passa o que parece nome de campo: um texto arbitrário aqui seria conteúdo
 * do cliente aparecendo como se fosse rótulo do sistema.
 */
export function tipoNaoSuportado(message: Pick<Message, "type" | "metadata">): string | null {
  const bruto = message.metadata?.tipo_nao_suportado;
  if (typeof bruto === "string" && /^[A-Za-z0-9_]{1,60}$/.test(bruto)) return bruto;
  return message.type && message.type !== "text" ? message.type : null;
}

/**
 * Bolha que chegou sem nada a mostrar: sem texto, sem mídia, sem cartão.
 *
 * Antes ela saía VAZIA, só com a hora, e o atendente não tinha como saber se o
 * cliente mandou algo. Dizer que existe uma mensagem e onde vê-la é o mínimo.
 */
export function AvisoSemConteudo({ message }: { message: Pick<Message, "type" | "metadata"> }) {
  const t = useT();
  const tipo = tipoNaoSuportado(message);
  return (
    <p className="text-xs italic text-text-subtle">
      <Question size={13} aria-hidden className="mr-1 inline-block align-text-bottom" />
      {tipo
        ? t("Mensagem não suportada (tipo {tipo}). Veja no celular.").replace("{tipo}", tipo)
        : t("Mensagem sem conteúdo. Veja no celular.")}
    </p>
  );
}
