/**
 * CREDENCIAL RECONHECIDA PELO VALOR — módulo PURO, sem banco e sem rede.
 *
 * `enxugar-para-arquivo.ts` reconhece credencial pelo NOME da chave (`token`,
 * `secret`, `apikey`…). Isso deixa passar o segredo guardado em chave de nome
 * inócuo — `{"auth": "Bearer …"}`, `{"session": "<hex>"}`, `{"jwt": "eyJ…"}`,
 * `{"pwd": "…"}`, `{"key": "<base64>"}` —, apontado pelo @Cassio_SecRev na
 * revisão da #98 (P2). Este módulo olha o VALOR, em duas camadas:
 *
 *   1. Em QUALQUER chave: valor que É uma credencial pela forma — esquema de
 *      autorização (`Bearer …`, `Basic …`) ou JWT (`eyJ….….…`). Não há texto
 *      legítimo de mensagem com essa cara inteira.
 *   2. Em chave de nome SUSPEITO (palavra `auth`, `jwt`, `session`, `sid`,
 *      `pass`, `pwd`, `key`, `x-auth`…): valor com cara de segredo — sem espaço
 *      e de alta entropia; para `pass`/`pwd`, qualquer valor sem espaço.
 *
 * A camada 2 exige a palavra no nome porque entropia sozinha pegaria todo id de
 * mensagem do WhatsApp (`3EB0C7…`) — que é exatamente o que quem investiga quer
 * ler no arquivo. `session: "default"` (nome da sessão do WAHA) fica: entropia
 * baixa.
 */

/** Palavras do nome da chave que tornam o valor suspeito. */
const PALAVRAS_SUSPEITAS = new Set(["auth", "jwt", "session", "sessionid", "sid", "key", "xauth"]);
/** Palavras de senha: qualquer valor sem espaço é tratado como senha. */
const PALAVRAS_DE_SENHA = new Set(["pass", "pwd", "pin"]);

const ESQUEMA_DE_AUTORIZACAO = /^(?:bearer|basic|token|digest)\s+\S{8,}$/i;
const JWT = /^eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*$/;
const SEM_ESPACO = /^\S+$/;

/** `xAuthToken`, `x-auth`, `session_id` → palavras em minúsculas. */
export function palavrasDaChave(chave: string): string[] {
  const separadas = chave
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // `x-auth` também como uma palavra só, para casar `xauth`.
  return [...separadas, separadas.join("")];
}

/** Bits por caractere (Shannon). Segredo aleatório fica perto de 4–6. */
export function entropia(texto: string): number {
  const contagem = new Map<string, number>();
  for (const c of texto) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of contagem.values()) {
    const p = n / texto.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Camada 1: o valor É uma credencial, qualquer que seja a chave. */
export function valorEhCredencial(valor: string): boolean {
  const v = valor.trim();
  return ESQUEMA_DE_AUTORIZACAO.test(v) || JWT.test(v);
}

function pareceSegredoAleatorio(valor: string): boolean {
  return valor.length >= 16 && SEM_ESPACO.test(valor) && entropia(valor) >= 3;
}

/** Camada 1 + camada 2: a chave e o valor juntos indicam credencial? */
export function credencialPeloValor(chave: string, valor: unknown): boolean {
  if (typeof valor !== "string" || valor === "") return false;
  if (valorEhCredencial(valor)) return true;
  const palavras = palavrasDaChave(chave);
  if (palavras.some((p) => PALAVRAS_DE_SENHA.has(p))) return SEM_ESPACO.test(valor.trim());
  if (palavras.some((p) => PALAVRAS_SUSPEITAS.has(p))) return pareceSegredoAleatorio(valor.trim());
  return false;
}
