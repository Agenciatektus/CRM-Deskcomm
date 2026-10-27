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
import type SharpPadrao from "sharp";

import { fail } from "@/lib/api/wrappers";
import { pareceSvg } from "@/lib/branding/logo-arquivo";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  BUCKET_DE_FOTOS,
  farejarFoto,
  LARGURAS_DE_FOTO,
  TAMANHO_MAXIMO_DA_FOTO,
  type TipoDeFoto,
  versao,
} from "./foto";

type Traduzir = (texto: string) => string;

/** Folga para o envelope do multipart (boundary, cabeçalhos da parte). */
const FOLGA_DO_MULTIPART = 64 * 1024;

/**
 * Lê o corpo INTEIRO com teto, contando os bytes durante o stream.
 *
 * O `content-length` só barra quem o declara. Corpo `chunked` não declara nada,
 * e `req.formData()` leria tudo para a memória antes de qualquer conferência —
 * a única barreira seria o limite do proxy. Aqui a leitura para (e cancela o
 * stream) no primeiro byte acima do teto. `null` = passou do teto.
 */
export async function lerCorpoComTeto(req: Request, teto: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array(0);
  const leitor = req.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    pedacos.push(value);
  }
  const corpo = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) {
    corpo.set(p, pos);
    pos += p.byteLength;
  }
  return corpo;
}

/** Teto de pixels para DECODIFICAR — a mesma régua da miniatura (recusa a bomba). */
const LIMITE_DE_PIXELS = 40_000_000;
/** Lado máximo gravado: avatar e foto de empresa aparecem em até 64px. */
const LADO_MAXIMO = 1024;

type Sharp = typeof SharpPadrao;
let sharpCarregado: Promise<Sharp | null> | null = null;
function carregarSharp(): Promise<Sharp | null> {
  sharpCarregado ??= import("sharp")
    .then((m) => m.default)
    .catch(() => null);
  return sharpCarregado;
}

/**
 * REENCODA a imagem, e é isto que tira EXIF/GPS (LGPD): o `sharp` não copia
 * metadado nenhum para a saída sem `withMetadata()`/`keepExif()`, que aqui não
 * são chamados. A orientação do EXIF é APLICADA antes (`rotate()`), senão a foto
 * de celular sairia deitada ao perder a tag. Mesmo formato de entrada.
 *
 * Falha FECHADA: sem o binário nativo, ou com uma imagem que não decodifica, a
 * foto não é gravada — gravar o original seria gravar o GPS de quem a tirou.
 */
export async function limparFoto(
  bytes: Uint8Array,
  tipo: TipoDeFoto,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; motivo: "sem_processador" | "imagem_invalida" }> {
  const sharp = await carregarSharp();
  if (!sharp) return { ok: false, motivo: "sem_processador" };
  try {
    const base = sharp(bytes, { failOn: "error", limitInputPixels: LIMITE_DE_PIXELS })
      .rotate()
      .resize(LADO_MAXIMO, LADO_MAXIMO, { fit: "inside", withoutEnlargement: true });
    const saida =
      tipo === "image/png"
        ? base.png()
        : tipo === "image/webp"
          ? base.webp({ quality: 85 })
          : base.jpeg({ quality: 85, mozjpeg: true });
    return { ok: true, bytes: new Uint8Array(await saida.toBuffer()) };
  } catch {
    return { ok: false, motivo: "imagem_invalida" };
  }
}

/** Lê, confere e LIMPA o arquivo. Devolve os bytes já sem metadado, ou a recusa pronta. */
export async function lerFotoDoFormulario(
  req: Request,
  t: Traduzir,
  requestId: string,
): Promise<{ bytes: Uint8Array; tipo: TipoDeFoto } | { recusa: Response }> {
  const muitoGrande = () =>
    ({ recusa: fail("payload_too_large", t("A foto precisa ter até 1 MB."), 413, { requestId }) }) as const;
  const teto = TAMANHO_MAXIMO_DA_FOTO + FOLGA_DO_MULTIPART;
  // O declarado barra cedo; o stream com teto barra quem não declara.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > teto) return muitoGrande();
  const corpo = await lerCorpoComTeto(req, teto);
  if (!corpo) return muitoGrande();

  const form = await new Response(corpo as BlobPart, {
    headers: { "content-type": req.headers.get("content-type") ?? "" },
  })
    .formData()
    .catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return {
      recusa: fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId }),
    };
  }
  if (file.size > TAMANHO_MAXIMO_DA_FOTO) return muitoGrande();
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
  const limpa = await limparFoto(bytes, tipo);
  if (!limpa.ok) {
    if (limpa.motivo === "imagem_invalida") {
      return {
        recusa: fail("unsupported_media_type", t("A foto precisa ser PNG, JPG ou WebP."), 415, { requestId }),
      };
    }
    logger.error("[fotos] sharp indisponível: foto recusada para não gravar metadado", { requestId });
    return { recusa: fail("internal_error", t("Erro ao subir a foto."), 500, { requestId }) };
  }
  return { bytes: limpa.bytes, tipo };
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

/** `?w=` válido (32, 64, 128 ou 256) ou `null` (ausente/inválido = original). */
export function larguraPedida(req: Request): number | null {
  const w = Number(new URL(req.url).searchParams.get("w"));
  return (LARGURAS_DE_FOTO as readonly number[]).includes(w) ? w : null;
}

/**
 * Cabeçalhos do 200 redimensionado. `immutable` só quando o `?v=` pedido é o do
 * arquivo atual (a URL muda a cada troca); sem `v` ou `v` velho, cache curto como o
 * redirect. `private`: a rota é autenticada.
 */
function cabecalhosDoRedimensionado(caminho: string, v: string | null): Record<string, string> {
  const cache =
    v === versao(caminho) ? "private, max-age=31536000, immutable" : `private, max-age=${CACHE_DO_REDIRECT}`;
  return { "Content-Type": "image/webp", "Cache-Control": cache, Vary: "Cookie" };
}

/**
 * Baixa o original e devolve uma versão `largura` px em WebP (200). Qualquer falha
 * (download, sharp, imagem inválida) devolve `null` e a rota cai no original.
 */
async function redimensionar(caminho: string, largura: number, v: string | null): Promise<Response | null> {
  try {
    const sharp = await carregarSharp();
    if (!sharp) return null;
    const { data } = await createAdminClient().storage.from(BUCKET_DE_FOTOS).download(caminho);
    if (!data) return null;
    const saida = await sharp(new Uint8Array(await data.arrayBuffer()), {
      failOn: "error",
      limitInputPixels: 1100 * 1100, // o guardado tem no máximo 1024 de lado
    })
      .timeout({ seconds: 3 })
      .rotate()
      .resize(largura, largura, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return new Response(new Uint8Array(saida), { status: 200, headers: cabecalhosDoRedimensionado(caminho, v) });
  } catch (e) {
    logger.warn("[fotos] redimensionar falhou, servindo o original", { detalhe: String(e) });
    return null;
  }
}

/**
 * Assina e redireciona. `private` não é detalhe: a autorização é por sessão, e
 * um cache compartilhado serviria a foto a quem a rota recusaria.
 */
export async function servirFoto(caminho: string, largura?: number | null, v?: string | null): Promise<Response> {
  if (largura) {
    const pequena = await redimensionar(caminho, largura, v ?? null);
    if (pequena) return pequena;
  }
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET_DE_FOTOS)
    .createSignedUrl(caminho, VIDA_DA_ASSINATURA);
  if (error || !data?.signedUrl) return semFoto();
  return new Response(null, {
    status: 307,
    headers: { Location: data.signedUrl, "Cache-Control": `private, max-age=${CACHE_DO_REDIRECT}` },
  });
}
