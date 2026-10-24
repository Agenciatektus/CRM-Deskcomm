/**
 * O `state` do OAuth da Meta para leitura de anúncios: assinado, com prazo,
 * carregando quem pediu a conexão.
 *
 * Mesma construção de `lib/plataformas-de-anuncio/google/estado.ts` (HMAC-SHA256,
 * prazo curto, comparação em tempo constante), duplicada de propósito: são
 * eixos sem relação, e uma dependência cruzada surpreenderia quem mexe num sem
 * saber do outro. A conexão é da ORGANIZAÇÃO; `userId` só serve ao audit log.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Para que serve este state. Dentro da carga assinada: state de outro fluxo não passa. */
export const PROPOSITO_DO_ESTADO = "meta_ads_leitura";

/**
 * A chave do cookie de vínculo deste fluxo, derivada: o vínculo da Agenda usa o
 * mesmo nome de cookie e o mesmo formato, e com a chave pura os dois se
 * confundiriam.
 */
export function segredoDoVinculo(segredoDaInstalacao: string): string {
  return `${PROPOSITO_DO_ESTADO}:${segredoDaInstalacao}`;
}

export const VALIDADE_DO_ESTADO_MS = 10 * 60 * 1000;

const TAMANHO_MINIMO_DO_SEGREDO = 16;

export interface EstadoDaConexaoMeta {
  organizationId: string;
  userId: string;
  nonce: string;
  expiraEmMs: number;
  /** Sessão de quem iniciou: a régua de suporte do callback confere por ela. */
  authSessionId?: string;
}

function assinar(carga: string, segredo: string): Buffer {
  return createHmac("sha256", segredo).update(carga, "utf8").digest();
}

function conferirSegredo(segredo: string): string {
  const s = segredo?.trim() ?? "";
  if (s.length < TAMANHO_MINIMO_DO_SEGREDO) {
    throw new Error(
      "INTERNAL_SECRET ausente ou curto demais: sem ele o retorno da Meta não tem como ser verificado",
    );
  }
  return s;
}

export function emitirEstado(
  dados: { organizationId: string; userId: string; authSessionId?: string },
  opcoes: { segredo: string; agora: Date; nonce?: string; validadeMs?: number },
): string {
  const segredo = conferirSegredo(opcoes.segredo);
  const organizationId = dados.organizationId?.trim() ?? "";
  const userId = dados.userId?.trim() ?? "";
  if (!organizationId || !userId) throw new Error("state precisa de organizationId e userId");
  if (organizationId.includes(".") || userId.includes(".")) {
    throw new Error(
      "organizationId/userId com ponto: o separador da carga do state não sobreviveria",
    );
  }
  const sessao = dados.authSessionId?.trim() ?? "";
  if (sessao.includes("."))
    throw new Error("authSessionId com ponto: o separador da carga não sobreviveria");

  const nonce = opcoes.nonce?.trim() || randomBytes(16).toString("hex");
  const expira = opcoes.agora.getTime() + (opcoes.validadeMs ?? VALIDADE_DO_ESTADO_MS);
  const carga = `${PROPOSITO_DO_ESTADO}.${organizationId}.${userId}.${nonce}.${expira}${sessao ? `.${sessao}` : ""}`;
  const assinatura = assinar(carga, segredo).toString("hex");
  return `${Buffer.from(carga, "utf8").toString("base64url")}.${assinatura}`;
}

/** O conteúdo do `state` quando ele é nosso e ainda vale; `null` em qualquer outro caso. */
export function verificarEstado(
  token: string | null | undefined,
  opcoes: { segredo: string; agora: Date },
): EstadoDaConexaoMeta | null {
  if (!token) return null;
  const segredo = conferirSegredo(opcoes.segredo);

  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [cargaCodificada, assinaturaHex] = partes;
  if (!cargaCodificada || !assinaturaHex) return null;

  const carga = Buffer.from(cargaCodificada, "base64url").toString("utf8");
  const esperada = assinar(carga, segredo);
  const recebida = Buffer.from(assinaturaHex, "hex");
  if (recebida.length !== esperada.length) return null;
  if (!timingSafeEqual(recebida, esperada)) return null;

  const [proposito, ...campos] = carga.split(".");
  // O state é do MESMO formato e da MESMA chave que o da Agenda do Google, cuja porta
  // de entrada aceita papel menor. Sem o propósito dentro da carga assinada, um
  // state da Agenda valeria aqui.
  if (proposito !== PROPOSITO_DO_ESTADO) return null;
  if (campos.length < 4 || campos.length > 5) return null;
  const [organizationId, userId, nonce, expiraTexto, authSessionId] = campos;
  const expiraEmMs = Number(expiraTexto);
  if (!organizationId || !userId || !nonce || !Number.isFinite(expiraEmMs)) return null;
  if (opcoes.agora.getTime() > expiraEmMs) return null;

  return { organizationId, userId, nonce, expiraEmMs, ...(authSessionId ? { authSessionId } : {}) };
}
