/**
 * O motivo com que a troca de funil encerra a origem (o porquê está em
 * `./motivo-da-perda.ts`, que o reexporta).
 *
 * Mora sozinho porque a tela de perda (`./motivos-de-perda-do-funil.ts`, no
 * navegador) só precisa desta constante, e `motivo-da-perda.ts` traz o
 * dicionário de idiomas inteiro junto.
 */
export const MOTIVO_DA_TRANSFERENCIA = "moved_to_another_pipeline";
