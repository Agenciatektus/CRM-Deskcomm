/**
 * DIVERGÊNCIA TEKTUS (subida 1.73): no upstream este módulo CLONAVA o negócio no
 * funil de destino e encerrava a origem (`transfereParaOFunil`), usado pela
 * automação `create_or_move_lead` e pelo destino da intenção do roteador (#2155).
 *
 * No fork a regra de produto é outra: trocar de funil MOVE o mesmo card (9053,
 * `lib/leads/mover-de-funil.ts`), nunca clona. Os dois chamadores do upstream
 * usam o mover. O arquivo fica, só com as colunas, para a próxima subida que
 * mexer aqui conflitar em vez de reintroduzir o clone calada.
 */
import type { NegocioParaMover } from "@/lib/leads/mover-de-funil";

/** As colunas que a troca lê do negócio de origem (as de `NegocioParaMover`). */
export const COLUNAS_DA_ORIGEM = "id, pipeline_id, stage_id, status, contact_id, custom_fields, value_cents";

/** A linha do negócio de origem como a troca a lê. */
export type OrigemDaTransferencia = NegocioParaMover;
