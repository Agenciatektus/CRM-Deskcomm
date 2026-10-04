import type { MotivoDeRecusa } from "./inscrever";

/**
 * Por que um negócio não entrou na cadência — a frase que a tela mostra para
 * cada código de `MotivoDeRecusa` (`lib/cadencia/inscrever.ts`).
 *
 * Mora aqui, e não na tela, pelo mesmo motivo de `FRASE_DO_MOTIVO` em
 * `lib/escalacao/passagem.ts`: código de vocabulário é chave, não texto, e a
 * cerca de `tests/unit/passagem-motivo-em-portugues.test.ts` recusa código cru
 * dentro de `components/`. O vocabulário da cadência e o da passagem
 * compartilham o literal `sem_telefone` (conceitos vizinhos, tabelas
 * diferentes), e a tabela dentro da tela fazia a cerca acusar vazamento.
 *
 * A chave é `string` porque a prévia devolve o código como texto; o
 * `satisfies` garante que toda chave daqui é um `MotivoDeRecusa` de verdade.
 * Os códigos sem frase caem no genérico "não entram" de quem lê a tabela.
 * Cada frase precisa de par `es` em `lib/i18n/dicionario.ts`.
 */
export const FRASE_DA_RECUSA: Readonly<Record<string, string>> = {
  negocio_fora_do_funil: "não é deste funil",
  negocio_fechado: "negócio já fechado",
  negocio_sem_contato: "negócio sem contato",
  contato_indisponivel: "contato indisponível",
  contato_bloqueado_ou_optout: "contato bloqueado ou pediu para sair",
  telefone_suprimido: "telefone pediu para sair em outro cadastro",
  sem_telefone: "contato sem telefone",
  teto_do_dia: "passou do limite de inscrições de hoje",
  ja_em_outro_fluxo: "já está em outra régua",
  ja_passou_pela_cadencia: "passou por esta cadência nos últimos 30 dias",
} satisfies Partial<Record<MotivoDeRecusa, string>>;
