/**
 * A RÉGUA DA CADÊNCIA COMO LISTA — reexportação de `lib/regua/timeline.ts`.
 *
 * O conversor lista ↔ grafo saiu daqui quando a CAMPANHA ganhou passos
 * (migration 9037): as duas features montam a mesma lista e publicam o mesmo
 * grafo linear no mesmo motor. O módulo neutro é o de `lib/regua/`; este
 * arquivo fica para as telas da cadência continuarem lendo `PassoDaCadencia` do
 * lugar onde sempre leram — renomear em volta não melhoraria nada e espalharia
 * o diff por três componentes e um teste.
 */
export {
  ESPERA_MAXIMA_MS,
  ESPERA_MINIMA_MS,
  MS_POR_HORA,
  grafoDaTimeline,
  novoIdDePasso,
  timelineDoGrafo,
} from "@/lib/regua/timeline";

/** O passo da régua, com o nome que a cadência usa. */
export type { PassoDaRegua as PassoDaCadencia } from "@/lib/regua/timeline";
