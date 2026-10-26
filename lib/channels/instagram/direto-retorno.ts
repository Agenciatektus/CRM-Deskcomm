/**
 * O destino da ponte de volta do "Conectar com o Instagram" (`app/api/v1/channels/instagram/retorno`).
 * Fora da rota porque o Next só aceita handlers como export de `route.ts`.
 */
import { CAMINHO_DA_PAGINA_DE_RETORNO } from "./direto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIVOS = new Set([
  "expirado",
  "negado",
  "conta_ja_conectada",
  "pedido_ja_usado",
  "falha_na_conexao",
  "erro_interno",
  "codigo_ausente",
]);

export function destinoDaVoltaDoInstagram(params: URLSearchParams): string {
  const pedido = params.get("pedido") ?? "";
  const status = params.get("status") === "ok" ? "ok" : "erro";
  const motivo = params.get("motivo") ?? "";
  const q = new URLSearchParams();
  if (UUID.test(pedido)) q.set("pedido", pedido);
  q.set("status", status);
  if (status === "erro" && MOTIVOS.has(motivo)) q.set("motivo", motivo);
  return `${CAMINHO_DA_PAGINA_DE_RETORNO}?${q.toString()}`;
}
