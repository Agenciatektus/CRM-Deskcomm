import { PHOSPHOR } from "./phosphor";

/**
 * Ícones do CRM: Phosphor, os mesmos glifos da interface (peso duotone por padrão, bold para
 * ações e tiques). Os caminhos vêm de `phosphor.ts`, gerado a partir do pacote (MIT); a LP não
 * carrega biblioteca de ícones. Decorativos (`aria-hidden`); o texto ao lado diz o que é.
 */
export type NomeIcone = keyof typeof PHOSPHOR;

export function Icone({
  nome,
  className = "size-4",
  peso = "duotone",
}: {
  nome: NomeIcone;
  className?: string;
  peso?: "duotone" | "regular" | "bold" | "fill";
}) {
  const g = PHOSPHOR[nome];
  if (!g) return null;
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className} aria-hidden="true" focusable="false">
      {peso === "regular"
        ? g.d.filter(([, fraco]) => !fraco).map(([d]) => <path key={d} d={d} />)
        : peso === "fill" && g.f
        ? g.f.map((d) => <path key={d} d={d} />)
        : peso === "bold"
          ? g.b.map((d) => <path key={d} d={d} />)
        : g.d.map(([d, fraco]) => <path key={d} d={d} opacity={fraco ? 0.2 : undefined} />)}
    </svg>
  );
}
