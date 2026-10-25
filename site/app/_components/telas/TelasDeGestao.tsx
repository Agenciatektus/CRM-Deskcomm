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
        <div className="flex items-center gap-3">
          <span
            className={`grid size-10 place-items-center rounded-field ${
              icone === "chat" ? "bg-[#103a2a] text-[#6fe0b0]" : "bg-[#3b1a33] text-[#f0a6d6]"
            }`}
          >
            <Icone nome={icone} className="size-5" />
          </span>
          <div>
            <p className="m-0 text-[0.98rem] font-bold">{titulo}</p>
            <p className="m-0 text-meta text-text-subtle">{detalhe}</p>
          </div>
        </div>
        <Selo tom="ok">
          <span className="a-pulso size-1.5 rounded-full bg-ok" /> conectado
        </Selo>
      </div>
      {qr ? (
        <div
          aria-hidden="true"
          className="grid size-24 grid-cols-9 gap-px self-start rounded-field bg-white p-1.5 [--q:#0d0e11]"
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
      <dl className="m-0 mt-auto grid gap-2 text-meta">
        {itens.map(([r, v]) => (
          <div key={r} className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <dt className="text-text-subtle">{r}</dt>
            <dd className="m-0 text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
