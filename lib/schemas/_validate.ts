import type { ZodError, ZodSchema } from "zod";
import { ApiError } from "@/lib/api/types";

function toFieldErrors(err: ZodError): Record<string, string[]> {
  return err.flatten().fieldErrors as Record<string, string[]>;
}

export interface OpcoesDaValidacao {
  /**
   * Teto do corpo BRUTO, em bytes, conferido antes do `JSON.parse`: pelo
   * `Content-Length` declarado e de novo na leitura (o cabeçalho pode mentir ou
   * faltar). Sem ele, um campo medido depois do parse (o `metadata` do envio,
   * por exemplo) deixaria passar ~6x o teto em escapes `\uXXXX`, e o servidor
   * já teria alocado tudo.
   */
  maxBytes?: number;
  /** O request id da requisição, para o erro levar o mesmo id da resposta. */
  requestId?: string;
}

async function lerComTeto(request: Request, maxBytes: number, requestId: string): Promise<string> {
  const muitoGrande = () =>
    new ApiError(413, "payload_too_large", { limite_bytes: maxBytes }, requestId, "Corpo da requisição grande demais.");
  const declarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) throw muitoGrande();
  if (!request.body) return "";
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await leitor.cancel().catch(() => undefined);
      throw muitoGrande();
    }
    partes.push(value);
  }
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.byteLength;
  }
  return new TextDecoder().decode(junto);
}

export async function validateRequest<T>(
  schema: ZodSchema<T>,
  request: Request,
  opcoes: OpcoesDaValidacao = {},
): Promise<T> {
  const requestId = opcoes.requestId ?? crypto.randomUUID();
  let body: unknown;
  try {
    body =
      opcoes.maxBytes === undefined
        ? await request.json()
        : JSON.parse(await lerComTeto(request, opcoes.maxBytes, requestId));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, "body_malformed", undefined, requestId, "Body must be valid JSON");
  }
  let parsed: ReturnType<ZodSchema<T>["safeParse"]>;
  try {
    parsed = schema.safeParse(body);
  } catch (err) {
    // Um schema pode RECUSAR com status próprio (o 413 do metadata do envio):
    // sai com o request id desta requisição, não com um id inventado.
    if (err instanceof ApiError) {
      throw new ApiError(err.status, err.code, err.details, requestId, err.message);
    }
    throw err;
  }
  if (!parsed.success) {
    throw new ApiError(
      422,
      "validation_error",
      { fieldErrors: toFieldErrors(parsed.error) },
      requestId,
      "Validation failed",
    );
  }
  return parsed.data;
}

export function validateBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "validation_error",
      { fieldErrors: toFieldErrors(parsed.error) },
      crypto.randomUUID(),
      "Validation failed",
    );
  }
  return parsed.data;
}
