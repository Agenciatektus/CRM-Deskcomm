/**
 * O QUE DO PAYLOAD NÃO ENTRA NO ARQUIVO — módulo PURO, sem banco e sem rede.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * Medido em produção (28/09/2026): `webhook_events_log` ocupava 621 MB de um
 * banco de 689 MB, e o banco caiu ao estourar os 500 MB do plano. O servidor de
 * WhatsApp manda a MÍDIA INTEIRA em `base64` (além da `downloadURL`), e o
 * arquivo gravava isso duas vezes — no `raw_body` (texto) e no `payload_parsed`
 * (jsonb). O mesmo payload traz `token`: a credencial da instância em claro.
 *
 * ─── Por que a regra deixou de ser "só o topo" (05/10/2026) ────────────────
 *
 * A primeira versão (PR #42) olhava só duas chaves no TOPO do payload. Medido
 * em produção uma semana depois: 7.291 de 7.306 eventos do canal Verdash com o
 * token em claro, e itens de álbum (`{"album":{…,"role":"item"},"base64":…}`)
 * com a mídia inteira, até 10 MB cada. Uma lista de nomes num lugar fixo quebra
 * na próxima mudança de formato do provedor — e o formato desse provedor já
 * mudou três vezes. A regra agora vale para QUALQUER formato:
 *
 *   1. CHAVE SENSÍVEL em qualquer profundidade (objeto, lista, JSON dentro de
 *      string, corpo `x-www-form-urlencoded`): o valor vira `"[omitido]"`.
 *   2. MÍDIA INLINE (chave com `base64` no nome) em qualquer profundidade: vira
 *      marcador com tamanho e sha256.
 *   3. TETO GENÉRICO: qualquer string acima de `TETO_DE_TEXTO` caracteres vira o
 *      mesmo marcador, seja qual for a chave. É o que pega o formato que ninguém
 *      previu — mídia em campo de nome novo não passa mais por ter nome novo.
 *   4. Parâmetro de credencial em URL (`?token=…`) tem o valor omitido.
 *   5. Corpo que não é JSON nem formulário: credencial com cara de
 *      `"chave":"valor"` ou `?token=` é omitida, e o texto é cortado no teto.
 *   6. Teto do corpo inteiro (`TETO_DO_CORPO`): mil strings de 4 KB também
 *      enchem o banco.
 *
 * ─── O que fica no lugar ────────────────────────────────────────────────────
 *
 * Um marcador, não um buraco: `"[omitido:midia:123456c:sha=0123456789abcdef]"`
 * para peso (quem investiga sabe que havia algo, de que tamanho, e consegue
 * casar o hash com o arquivo guardado no Storage), `"[omitido]"` para segredo
 * (sabe que o campo veio, sem ver o valor — e sem hash, que permitiria
 * correlacionar a credencial). A CHAVE continua existindo porque quem lista os
 * campos recebidos (a tela de histórico) não pode ver a lista mudar por isso.
 *
 * O marcador é uma STRING CURTA, não um objeto: medido em produção em
 * 05/10/2026, o objeto `{omitido, motivo, caracteres, sha256}` (sha de 64
 * caracteres) deixava a linha reescrita MAIOR que a original comprimida —
 * 500 linhas, 2,4 MB → 4,0 MB. Prefixo de 16 hex do sha256 basta para casar
 * com o arquivo no Storage.
 *
 * ─── O que NÃO muda ─────────────────────────────────────────────────────────
 *
 * Payload sem nada a cortar sai IDÊNTICO — o `raw_body` byte a byte, para que a
 * assinatura de quem assina o corpo continue reconferível. Só quando algo foi
 * cortado o texto é reescrito a partir do objeto enxuto.
 *
 * ─── Por que cortar aqui, e não na ingestão ────────────────────────────────
 *
 * A ingestão recebe o corpo da REQUISIÇÃO, não do arquivo, e o anexo sai da
 * `downloadURL` (ver `anexoDe` em `verdash/webhook.ts`). O arquivo é o único
 * lugar onde esses bytes viravam peso, e o único onde o token virava log.
 */
import { createHash } from "node:crypto";

import { credencialPeloValor, valorEhCredencial } from "./credencial-pelo-valor";

/** String acima disto vira marcador, qualquer que seja a chave. */
export const TETO_DE_TEXTO = 4096;
/** O corpo enxuto inteiro acima disto vira marcador. */
export const TETO_DO_CORPO = 256 * 1024;
/**
 * Base64 até este tamanho fica: o marcador (~45 caracteres) não pode ser maior
 * que o que ele substitui — a linha reescrita tem de encolher, nunca crescer.
 */
const TETO_DE_MIDIA_MINUSCULA = 64;
/** Aninhamento além disto não é payload legítimo de webhook. */
const PROFUNDIDADE_MAXIMA = 32;

export const TOKEN_OMITIDO = "[omitido]";

/**
 * Pedaços de nome de chave que marcam credencial. Comparados contra o nome em
 * minúsculas e sem separadores (`x-api-key` → `xapikey`, `access_token` →
 * `accesstoken`). Pedaço, e não nome exato, porque o provedor que hoje manda
 * `token` amanhã manda `instanceToken` — e omitir o valor de um campo inócuo
 * num LOG custa nada, enquanto deixar passar uma credencial custa um incidente.
 *
 * `mediakey` está aqui porque, junto com o `directPath`, abre a mídia cifrada
 * no CDN do WhatsApp: é chave de acesso, não metadado.
 */
const PEDACOS_DE_SEGREDO = [
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "authorization",
  "cookie",
  "privatekey",
  "credential",
  "mediakey",
] as const;

/** Pedaço de nome de chave que marca mídia inline. */
const PEDACO_DE_MIDIA = "base64";

/**
 * Parâmetro de URL cujo valor é credencial (`key=`, `sig=`, `auth=` e `code=`
 * entraram na revisão do @Cassio_SecRev na #98). `signature` fica DE FORA de
 * propósito: a URL de anexo da Meta (`lookaside.fbsbx.com/...&signature=`) é
 * relida do arquivo por `scripts/midia-do-instagram-retroativa.ts`.
 */
const PARAMETRO_DE_SEGREDO =
  /([?&;](?:access_token|refresh_token|id_token|token|apikey|api_key|key|secret|password|sig|auth|code)=)[^&#\s"']+/gi;

function normalizarChave(chave: string): string {
  return chave.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function chaveSensivel(chave: string): boolean {
  const n = normalizarChave(chave);
  return PEDACOS_DE_SEGREDO.some((p) => n.includes(p));
}

function chaveDeMidia(chave: string): boolean {
  return normalizarChave(chave).includes(PEDACO_DE_MIDIA);
}

export type MotivoDaOmissao = "midia" | "tamanho" | "profundidade";

export function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/** `[omitido:midia:123456c:sha=0123456789abcdef]` — curto de propósito. */
export function marcador(motivo: MotivoDaOmissao, texto: string): string {
  return `[omitido:${motivo}:${texto.length}c:sha=${sha256(texto).slice(0, 16)}]`;
}

/** Estado de uma passada: se algo foi cortado. */
interface Passada {
  cortou: boolean;
}

/** URL com credencial na query perde o valor; o resto fica. */
export function semCredencialNaUrl(texto: string, p: Passada): string {
  if (!texto.includes("=")) return texto;
  const limpo = texto.replace(PARAMETRO_DE_SEGREDO, `$1${TOKEN_OMITIDO}`);
  if (limpo !== texto) p.cortou = true;
  return limpo;
}

/**
 * Uma string qualquer: teto, JSON embutido, credencial em URL.
 *
 * JSON dentro de string é real (formulário com `jsonData`, provedor que
 * embrulha o evento em texto) e esconde a chave sensível de quem só olha
 * objetos — por isso é aberto e passado pela mesma regra.
 */
function enxugarTexto(texto: string, p: Passada, profundidade: number): unknown {
  if (valorEhCredencial(texto)) {
    p.cortou = true;
    return TOKEN_OMITIDO;
  }
  if (texto.length > TETO_DE_TEXTO) {
    p.cortou = true;
    return marcador("tamanho", texto);
  }
  const t = texto.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const dentro = JSON.parse(texto) as unknown;
      if (dentro && typeof dentro === "object") {
        const sub: Passada = { cortou: false };
        const limpo = enxugarValor(dentro, sub, profundidade + 1);
        if (!sub.cortou) return texto;
        p.cortou = true;
        return JSON.stringify(limpo);
      }
    } catch {
      // Não era JSON: segue como texto comum.
    }
  }
  return semCredencialNaUrl(texto, p);
}

function enxugarObjeto(v: Record<string, unknown>, p: Passada, profundidade: number): unknown {
  const sub: Passada = { cortou: false };
  const out: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(v)) {
    if (
      (chaveSensivel(chave) && valor !== null && valor !== undefined && valor !== "") ||
      credencialPeloValor(chave, valor)
    ) {
      out[chave] = TOKEN_OMITIDO;
      sub.cortou = true;
    } else if (chaveDeMidia(chave) && typeof valor === "string" && valor.length > TETO_DE_MIDIA_MINUSCULA) {
      out[chave] = marcador("midia", valor);
      sub.cortou = true;
    } else {
      out[chave] = enxugarValor(valor, sub, profundidade + 1);
    }
  }
  if (!sub.cortou) return v;
  p.cortou = true;
  return out;
}

function enxugarValor(v: unknown, p: Passada, profundidade: number): unknown {
  if (profundidade > PROFUNDIDADE_MAXIMA) {
    p.cortou = true;
    return marcador("profundidade", JSON.stringify(v) ?? "");
  }
  if (typeof v === "string") return enxugarTexto(v, p, profundidade);
  if (Array.isArray(v)) {
    const sub: Passada = { cortou: false };
    const out = v.map((item) => enxugarValor(item, sub, profundidade + 1));
    if (!sub.cortou) return v;
    p.cortou = true;
    return out;
  }
  if (v && typeof v === "object") return enxugarObjeto(v as Record<string, unknown>, p, profundidade);
  return v;
}

/**
 * Devolve o valor enxuto e se algo foi cortado. Não muta a entrada; sem corte,
 * devolve a MESMA referência.
 */
export function enxugarParaArquivo<T>(payload: T): { payload: T; cortou: boolean } {
  const p: Passada = { cortou: false };
  const out = enxugarValor(payload, p, 0) as T;
  return { payload: p.cortou ? out : payload, cortou: p.cortou };
}

export interface ArquivoEnxuto {
  rawBody: string;
  parsed: Record<string, unknown> | null;
}

function cortarNoTeto(texto: string, original: string, teto: number): string {
  if (texto.length <= teto) return texto;
  return `${texto.slice(0, TETO_DE_TEXTO)}…${marcador("tamanho", original)}`;
}

/** `a=1&b=2`, sem espaço nem chave/colchete na frente: parece formulário. */
function pareceFormulario(texto: string): boolean {
  return /^[A-Za-z0-9_.%[\]-]+=/.test(texto) && !/\s/.test(texto.slice(0, 200));
}

/** Corpo `x-www-form-urlencoded` (o FZAP/wuzapi tem o modo `jsonData=…`). */
function formularioEnxuto(texto: string): string {
  const p: Passada = { cortou: false };
  const out = new URLSearchParams();
  for (const [chave, valor] of new URLSearchParams(texto)) {
    if ((chaveSensivel(chave) && valor !== "") || credencialPeloValor(chave, valor)) {
      out.append(chave, TOKEN_OMITIDO);
      p.cortou = true;
    } else if (chaveDeMidia(chave) && valor !== "") {
      out.append(chave, marcador("midia", valor));
      p.cortou = true;
    } else {
      const limpo = enxugarTexto(valor, p, 1);
      out.append(chave, typeof limpo === "string" ? limpo : JSON.stringify(limpo));
    }
  }
  return cortarNoTeto(p.cortou ? out.toString() : texto, texto, TETO_DO_CORPO);
}

/** Credencial com cara de `"chave": "valor"` em texto que não abriu como JSON. */
const SEGREDO_EM_TEXTO =
  /("[^"\\]*(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|private[_-]?key|credential|media[_-]?key)[^"\\]*"\s*:\s*")(?:[^"\\]|\\.)*(")/gi;

/** Sequência longa com alfabeto de base64: mídia inline, ache-se onde estiver. */
const TRECHO_BASE64 = /[A-Za-z0-9+/=_-]{1024,}/g;

function textoEnxuto(texto: string): string {
  const limpo = semCredencialNaUrl(
    texto
      .replace(SEGREDO_EM_TEXTO, `$1${TOKEN_OMITIDO}$2`)
      .replace(TRECHO_BASE64, (m) => marcador("midia", m)),
    { cortou: false },
  );
  return cortarNoTeto(limpo, texto, TETO_DE_TEXTO);
}

/**
 * O par (`raw_body`, `payload_parsed`) que vai para o arquivo.
 *
 * `payload_parsed` só recebe OBJETO: lista ou escalar é JSON legítimo e não cabe
 * no formato da coluna — continua `null`. Mas lista e escalar também passam pela
 * regra no `raw_body`: um evento em lote não pode carregar o token por ser lote.
 */
export function arquivoEnxuto(rawBody: string): ArquivoEnxuto {
  let v: unknown;
  try {
    v = JSON.parse(rawBody);
  } catch {
    return {
      rawBody: pareceFormulario(rawBody) ? formularioEnxuto(rawBody) : textoEnxuto(rawBody),
      parsed: null,
    };
  }

  const { payload, cortou } = enxugarParaArquivo(v);
  const texto = cortou ? JSON.stringify(payload) : rawBody;
  const ehObjeto = Boolean(payload) && typeof payload === "object" && !Array.isArray(payload);

  if (texto.length > TETO_DO_CORPO) {
    const chaves = ehObjeto ? Object.keys(payload as Record<string, unknown>) : [];
    const resumo = { omitido: marcador("tamanho", texto), chaves };
    return { rawBody: JSON.stringify(resumo), parsed: resumo as unknown as Record<string, unknown> };
  }

  return { rawBody: texto, parsed: ehObjeto ? (payload as Record<string, unknown>) : null };
}
