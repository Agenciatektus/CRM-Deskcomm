/**
 * A verificação pós-conexão: depois de gravar o token, o callback lista as contas de
 * anúncio que ele alcança, e a tela diz o que aconteceu.
 *
 * O desfecho viaja na URL de volta como um código e uma contagem (`?contas=33&bms=2`),
 * nunca como nome de conta, id ou token. Falha da verificação nunca desfaz a conexão.
 */
import type { ResultadoDeLeitura } from "../../types";

export type DesfechoDaVerificacao =
  | { tipo: "ok"; contas: number; bms: number }
  | { tipo: "aviso"; aviso: "sem_contas" | "leitura_falhou" };

/** Só as contagens sobrevivem: o resultado da Graph carrega nomes e ids que não saem daqui. */
export function desfechoDaVerificacao(
  leitura: ResultadoDeLeitura<readonly unknown[]>,
  bms: number,
): DesfechoDaVerificacao {
  if (!leitura.ok) return { tipo: "aviso", aviso: "leitura_falhou" };
  return leitura.dados.length > 0
    ? { tipo: "ok", contas: leitura.dados.length, bms }
    : { tipo: "aviso", aviso: "sem_contas" };
}

/** Os parâmetros de query do retorno (`?contas=33&bms=2` ou `?aviso=sem_contas`). */
export function parametrosDoDesfecho(d: DesfechoDaVerificacao): Record<string, string> {
  return d.tipo === "ok"
    ? { contas: String(d.contas), bms: String(d.bms) }
    : { aviso: d.aviso };
}

export type AvisoDaVerificacao = {
  tipo: "sucesso" | "aviso";
  texto: string;
  contas?: number;
};

const TETO = 100_000;
const numero = (v: string | undefined): number | null =>
  /^\d{1,6}$/.test(v ?? "") && Number(v) <= TETO ? Number(v) : null;

/** Lê o retorno da URL; qualquer coisa fora do combinado vira `null` (nada na tela). */
export function leituraDoRetorno(p: {
  contas?: string | undefined;
  aviso?: string | undefined;
}): AvisoDaVerificacao | null {
  const n = numero(p.contas);
  if (n !== null && n >= 1) {
    return {
      tipo: "sucesso",
      contas: n,
      texto: n === 1 ? "1 conta de anúncio acessível." : "{n} contas de anúncio acessíveis.",
    };
  }
  if (p.aviso === "sem_contas") {
    return {
      tipo: "aviso",
      texto:
        "Conectou, mas esta conta Meta não alcança nenhuma conta de anúncio: entre com a conta que gerencia os anúncios.",
    };
  }
  if (p.aviso === "leitura_falhou") {
    return {
      tipo: "aviso",
      texto:
        "A conexão foi gravada, mas não consegui conferir as contas de anúncio agora. Abra Análise › Meta Ads para testar ou tente reconectar.",
    };
  }
  return null;
}
