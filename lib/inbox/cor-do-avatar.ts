/**
 * A cor do avatar de um contato: um dos seis pares fundo/texto de
 * `--color-avatar-1..6` (app/globals.css), escolhido por hash ESTÁVEL.
 *
 * Por que hash e não posição na lista: a posição muda a cada conversa nova que
 * entra no topo, e a pessoa trocaria de cor enquanto o atendente olha. Pelo id,
 * a Mariana é sempre o mesmo tom na lista, no cabeçalho da conversa e no painel,
 * que é o que deixa o olho achar a pessoa sem ler o nome.
 *
 * Por que FNV-1a: é curto, sem dependência, e espalha bem strings parecidas
 * (UUIDs que diferem em poucos caracteres). Não é criptografia; só distribuição.
 *
 * A cor nunca é a única informação: o avatar carrega as iniciais junto.
 */
export const TOTAL_DE_CORES_DO_AVATAR = 6;

/**
 * As classes de cada par, LITERAIS de propósito: o Tailwind só gera o utilitário
 * que encontra escrito no código, então montar `bg-avatar-${n}` por template
 * produziria uma classe sem CSS nenhum.
 */
const CLASSES: readonly string[] = [
  "bg-avatar-1 text-avatar-1-fg",
  "bg-avatar-2 text-avatar-2-fg",
  "bg-avatar-3 text-avatar-3-fg",
  "bg-avatar-4 text-avatar-4-fg",
  "bg-avatar-5 text-avatar-5-fg",
  "bg-avatar-6 text-avatar-6-fg",
];

/** Índice 1..6 do par para a semente (id do contato; o nome quando não há id). */
export function indiceDaCorDoAvatar(semente: string | null | undefined): number {
  const texto = (semente ?? "").trim();
  if (!texto) return 1;
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % TOTAL_DE_CORES_DO_AVATAR) + 1;
}

/** As classes de fundo e texto do par que cabe à semente. */
export function classeDaCorDoAvatar(semente: string | null | undefined): string {
  return CLASSES[indiceDaCorDoAvatar(semente) - 1] ?? CLASSES[0] ?? "";
}
