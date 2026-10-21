/**
 * O que as rotas de foto (pessoa e organização) fazem igual: ler o arquivo do
 * multipart, recusar tamanho e tipo, subir, apagar o anterior e servir.
 *
 * Mesma ordem da rota do logo (`app/api/v1/marca/logo/route.ts`), pelo mesmo
 * motivo: tamanho antes de ler os bytes, SVG recusado com a razão em português,
 * tipo decidido pelos BYTES (`file.type` só entra no `details` do erro), e
 * sobe → grava → só então apaga o anterior.
 */
import "server-only";

import { fail } from "@/lib/api/wrappers";
import { pareceSvg } from "@/lib/branding/logo-arquivo";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { BUCKET_DE_FOTOS, farejarFoto, TAMANHO_MAXIMO_DA_FOTO, type TipoDeFoto } from "./foto";

type Traduzir = (texto: string) => string;

/** Lê e confere o arquivo. Devolve os bytes e o tipo farejado, ou a recusa pronta. */
export async function lerFotoDoFormulario(
  req: Request,
  t: Traduzir,
  requestId: string,
): Promise<{ bytes: Uint8Array; tipo: TipoDeFoto } | { recusa: Response }> {
  // O `content-length` declarado barra o corpo gigante antes do `formData()`
  // ler tudo para a memória. Folga de 64 KB para o envelope do multipart.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAXIMO_DA_FOTO + 64 * 1024) {
    return { recusa: fail("payload_too_large", t("A foto precisa ter até 1 MB."), 413, { requestId }) };
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return {
      recusa: fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId }),
    };
  }
  if (file.size > TAMANHO_MAXIMO_DA_FOTO) {
    return { recusa: fail("payload_too_large", t("A foto precisa ter até 1 MB."), 413, { requestId }) };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (pareceSvg(bytes)) {
    return {
      recusa: fail(
        "foto_svg_recusada",
        t("SVG não é aceito como foto. Envie PNG, JPG ou WebP."),
        415,
        { requestId },
      ),
    };
  }
  const tipo = farejarFoto(bytes);
  if (!tipo) {
    return {
      recusa: fail("unsupported_media_type", t("A foto precisa ser PNG, JPG ou WebP."), 415, {
        requestId,
        details: { content_type_declarado: file.type || null },
      }),
    };
  }
  return { bytes, tipo };
}

/** Sobe os bytes no bucket. `false` = falhou (já registrado no log). */
export async function subirFoto(
  caminho: string,
  bytes: Uint8Array,
  tipo: TipoDeFoto,
  requestId: string,
): Promise<boolean> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET_DE_FOTOS)
    .upload(caminho, bytes, { contentType: tipo, upsert: false });
  if (error) {
    logger.error("[fotos] upload falhou", { detalhe: error.message, requestId });
    return false;
  }
  return true;
}

/**
 * Apaga um objeto do bucket — só se `pertence` disser que ele é do dono de quem
 * pediu. Nunca lança: o ponteiro novo já está gravado. A recusa NÃO é silenciosa
 * (caminho fora do escopo é sinal de dado adulterado).
 */
export async function apagarFoto(
  caminho: string | null | undefined,
  pertence: (caminho: string) => boolean,
  requestId: string,
): Promise<void> {
  const limpo = (caminho ?? "").trim();
  if (!limpo) return;
  if (!pertence(limpo)) {
    logger.error("[fotos] recusei apagar arquivo fora do dono de quem pediu", {
      caminho_recusado: limpo,
      requestId,
    });
    return;
  }
  const { error } = await createAdminClient().storage.from(BUCKET_DE_FOTOS).remove([limpo]);
  if (error) logger.warn("[fotos] arquivo anterior ficou órfão", { detalhe: error.message, caminho: limpo });
}

/** Vida da URL assinada. Curta de propósito: se vazar, expira sozinha. */
const VIDA_DA_ASSINATURA = 300;
/** Menor que a assinatura (mesma conta de `/api/v1/contacts/[id]/avatar`). */
const CACHE_DO_REDIRECT = 240;
/** "Sem foto" também fica guardado um pouco: a lista não repergunta a cada render. */
const CACHE_DO_SEM_FOTO = 60;

/** 404 de "sem foto" — estado normal; o fallback de iniciais assume sozinho. */
export function semFoto(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": `private, max-age=${CACHE_DO_SEM_FOTO}` },
  });
}

/**
 * Assina e redireciona. `private` não é detalhe: a autorização é por sessão, e
 * um cache compartilhado serviria a foto a quem a rota recusaria.
 */
export async function servirFoto(caminho: string): Promise<Response> {
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET_DE_FOTOS)
    .createSignedUrl(caminho, VIDA_DA_ASSINATURA);
  if (error || !data?.signedUrl) return semFoto();
  return new Response(null, {
    status: 307,
    headers: { Location: data.signedUrl, "Cache-Control": `private, max-age=${CACHE_DO_REDIRECT}` },
  });
}
