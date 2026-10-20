/**
 * Como uma recusa de `fn_vocabulario_de_tags_operar` vira resposta HTTP.
 *
 * Mora fora da rota porque são DUAS rotas que chamam a mesma função: a de uma
 * etiqueta (`POST /api/v1/tags/vocabulario`) e a do lote
 * (`POST /api/v1/tags/vocabulario/lote`). Com o mapa copiado nas duas, a
 * próxima recusa nova (a 9038 trouxe duas de uma vez) entraria numa e a outra
 * responderia `internal_error` para a mesma causa.
 */
import { fail } from "@/lib/api/wrappers";

export type ErroDoBanco = { code?: string | null; message?: string | null };

export function respostaDoErroDoVocabulario(
  error: ErroDoBanco,
  requestId: string,
  details?: unknown,
): Response {
  const opts = { requestId, ...(details !== undefined ? { details } : {}) };
  // 9038: a etiqueta `cliente` reservada pela regra da agenda também chega como
  // 42501, mas não é falta de papel. Responder "forbidden" mandaria o gerente
  // pedir um acesso que ele já tem; o código próprio deixa a tela dizer onde
  // desligar a regra. Vem ANTES do 42501 genérico, e casa pela mensagem da
  // `fn_tags_reserva` (migration 9005).
  if (error.code === "42501" && /tags_etiqueta_do_sistema/.test(error.message ?? ""))
    return fail(
      "etiqueta_do_sistema",
      "A etiqueta cliente é do sistema enquanto a regra Clientes pela agenda estiver ligada.",
      409,
      opts,
    );
  // 9038 (7): a função passou a chamar `fn_tags_guarda`, que recusa sessão sem
  // o segundo fator com `tags_mfa_required` (também 42501).
  if (error.code === "42501" && /tags_mfa_required/.test(error.message ?? ""))
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, opts);
  if (error.code === "42501")
    return fail("forbidden", "Esta sessão não pode mudar as etiquetas da organização.", 403, opts);
  if (error.code === "22023")
    return fail("validation_failed", "Confira a etiqueta, o novo nome e a cor.", 422, opts);
  return fail("internal_error", "Não foi possível concluir a operação.", 500, opts);
}
