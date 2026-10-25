import { Icone } from "../ui/Icones";
import { Selo } from "../ui/Pecas";

/** Cartão de canal (WhatsApp, Instagram): tela de gestão do CRM, com dados FICTÍCIOS. */

export function CartaoCanal({
  titulo,
  detalhe,
  icone,
  itens,
  qr = false,
  visual,
}: {
  titulo: string;
  detalhe: string;
  icone: "chat" | "camera";
  itens: readonly (readonly [string, string])[];
  qr?: boolean;
  visual?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${
              icone === "chat" ? "bg-[oklch(0.62_0.15_150)]" : "bg-[oklch(0.58_0.2_0)]"
            }`}
          >
            <Icone nome={icone} peso="bold" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-base font-semibold">{titulo}</p>
            <p className="m-0 text-sm text-text-muted">{detalhe}</p>
          </div>
        </div>
        <Selo tom="ok">
          <span className="a-pulso size-1.5 rounded-full bg-success-fg" /> Conectado
        </Selo>
      </div>
      {qr ? (
        <div
          aria-hidden="true"
          className="grid size-24 grid-cols-9 gap-px self-start rounded-lg bg-white p-1.5 [--q:#0d0e11]"
        >
          {Array.from({ length: 81 }, (_, i) => {
            const x = i % 9;
            const y = Math.floor(i / 9);
            const canto = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
            const on = canto ? !((x === 1 || x === 7) && (y === 1)) || y === 1 : (x * 7 + y * 13 + x * y) % 3 === 0;
            return <i key={i} className={on ? "bg-[var(--q)]" : "bg-white"} />;
          })}
        </div>
      ) : null}
      {visual ? <div aria-hidden="true">{visual}</div> : null}
      <dl className="m-0 mt-auto grid gap-2 text-sm">
        {itens.map(([r, v]) => (
          <div key={r} className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <dt className="text-text-muted">{r}</dt>
            <dd className="m-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
