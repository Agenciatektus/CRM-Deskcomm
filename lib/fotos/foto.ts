/**
 * A FOTO de quem usa o sistema (avatar da pessoa) e a FOTO da organização (a que
 * aparece no lugar da sigla no trilho e no seletor de organização).
 *
 * ── Onde mora, e por que o bucket é PRIVADO ──────────────────────────────────
 *
 * Bucket `fotos-de-perfil` (migration 9061), privado, sem policy nenhuma em
 * `storage.objects`: só o `service_role` escreve (pelas rotas, depois dos gates)
 * e só o `service_role` assina leitura. Ao contrário do logo da marca
 * (`brand-logos`, público porque aparece na tela de LOGIN, para quem não tem
 * sessão), a foto só aparece DENTRO do produto — então ela é servida como a foto
 * do contato (`/api/v1/contacts/[id]/avatar`): uma rota confere quem pede e
 * redireciona para uma URL assinada curta.
 *
 * ── O caminho, e o que cada parte garante ────────────────────────────────────
 *
 *   usuarios/<user_id>/<uuid v4>.<png|jpg|webp>
 *   organizacoes/<org_id>/<uuid v4>.<png|jpg|webp>
 *
 * O dono vem SEMPRE de fonte confiável (a sessão, o cookie de organização
 * validado) e o nome é um uuid novo — nada que a pessoa digitou entra no caminho.
 * A forma é conferida de novo na LEITURA e na hora de APAGAR (`fotoDoUsuario`,
 * `fotoDaOrganizacao`): o ponteiro gravado pode ter vindo de uma versão antiga ou
 * de escrita direta no banco, e o `service_role` ignora RLS.
 *
 * Este módulo é importado por componente de cliente (as URLs), então não importa
 * nada de servidor: o uuid sai de `randomId()` (lib/random-id.ts), não de `node:crypto`.
 */
import { farejarTipo } from "@/lib/branding/logo-arquivo";
import { randomId } from "@/lib/random-id";

/** O bucket. Privado — ver o cabeçalho. */
export const BUCKET_DE_FOTOS = "fotos-de-perfil";

/** 1 MB. O mesmo número vive no `file_size_limit` do bucket (migration 9061). */
export const TAMANHO_MAXIMO_DA_FOTO = 1024 * 1024;

export type TipoDeFoto = "image/png" | "image/jpeg" | "image/webp";
export type ExtensaoDeFoto = "png" | "jpg" | "webp";

/**
 * O tipo REAL do arquivo, pelos bytes. `null` = não é PNG, JPEG nem WebP.
 *
 * PNG e JPEG reusam o farejador do logo. WebP é `RIFF<4 bytes de tamanho>WEBP`:
 * os 4 primeiros e os 4 a partir do 8º — o tamanho no meio varia.
 */
export function farejarFoto(bytes: Uint8Array): TipoDeFoto | null {
  const base = farejarTipo(bytes);
  if (base) return base;
  if (bytes.length >= 12) {
    const ascii = (de: number, ate: number) => String.fromCharCode(...bytes.subarray(de, ate));
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  }
  return null;
}

export function extensaoDaFoto(tipo: TipoDeFoto): ExtensaoDeFoto {
  return tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FORMA_DO_NOME = new RegExp(`^${UUID}\\.(?:png|jpg|webp)$`);
const FORMA_DO_DONO = new RegExp(`^${UUID}$`);

export const PREFIXO_DE_USUARIOS = "usuarios/";
export const PREFIXO_DE_ORGANIZACOES = "organizacoes/";

function prefixoDe(raiz: string, donoId: string): string | null {
  return FORMA_DO_DONO.test(donoId) ? `${raiz}${donoId}/` : null;
}

function bate(caminho: string | null | undefined, prefixo: string | null): boolean {
  const limpo = (caminho ?? "").trim();
  if (!prefixo || !limpo.startsWith(prefixo)) return false;
  return FORMA_DO_NOME.test(limpo.slice(prefixo.length));
}

/** O caminho é uma foto DESTA pessoa — e nada além disso. */
export function fotoDoUsuario(caminho: string | null | undefined, userId: string): boolean {
  return bate(caminho, prefixoDe(PREFIXO_DE_USUARIOS, userId));
}

/** O caminho é uma foto DESTA organização — e nada além disso. */
export function fotoDaOrganizacao(caminho: string | null | undefined, orgId: string): boolean {
  return bate(caminho, prefixoDe(PREFIXO_DE_ORGANIZACOES, orgId));
}

/** Caminho novo, não enumerável. `null` se o id do dono não tiver a forma de uuid. */
export function caminhoNovoDaFoto(
  dono: "usuario" | "organizacao",
  donoId: string,
  extensao: ExtensaoDeFoto,
): string | null {
  const prefixo = prefixoDe(dono === "usuario" ? PREFIXO_DE_USUARIOS : PREFIXO_DE_ORGANIZACOES, donoId);
  return prefixo ? `${prefixo}${randomId()}.${extensao}` : null;
}

/**
 * O pedaço do caminho que entra como `?v=` na URL da foto.
 *
 * O browser guarda o redirect da rota por alguns minutos (`private`). Trocar a
 * foto troca o uuid do arquivo, e com ele a URL — quem trocou vê a foto nova na
 * hora, sem esperar o cache vencer.
 */
function versao(caminho: string): string {
  const nome = caminho.slice(caminho.lastIndexOf("/") + 1);
  return nome.slice(0, 8);
}

/** Larguras que a rota de foto aceita em `?w=` (qualquer outra = original). */
export const LARGURAS_DE_FOTO = [32, 64, 128, 256] as const;

/** Acrescenta `w=` a uma URL de foto (com ou sem `?v=`). Sem largura, devolve a URL como veio. */
export function comLargura(url: string, largura?: number): string {
  return largura ? `${url}${url.includes("?") ? "&" : "?"}w=${largura}` : url;
}

/** A URL da foto de uma pessoa (a rota que confere quem pede e assina). */
export function urlDaFotoDoUsuario(userId: string, caminho?: string | null, largura?: number): string {
  const base = `/api/v1/usuarios/${encodeURIComponent(userId)}/foto`;
  return comLargura(caminho ? `${base}?v=${versao(caminho)}` : base, largura);
}

/** A URL da foto de uma organização, ou `null` quando ela não tem foto. */
export function urlDaFotoDaOrganizacao(
  orgId: string,
  caminho: string | null | undefined,
  largura?: number,
): string | null {
  if (!fotoDaOrganizacao(caminho, orgId)) return null;
  return comLargura(`/api/v1/organizacoes/${encodeURIComponent(orgId)}/foto?v=${versao(caminho!.trim())}`, largura);
}
