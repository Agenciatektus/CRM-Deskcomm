import { Icone } from "../ui/Icones";
import { Selo } from "../ui/Pecas";

/** Auditoria, canais e isolamento por empresa: as telas de gestão do CRM, com dados FICTÍCIOS. */

const REGISTROS = [
  ["14:05:12", "Camila Reis", "assumiu a conversa de Marina Duarte", "usuario"],
  ["14:03:41", "Agente de IA", "transferiu a conversa de Marina Duarte para Camila Reis", "agente"],
  ["14:03:40", "Agente de IA", "moveu o negócio de Marina Duarte para Negociação", "funil"],
  ["13:58:02", "Bruno Aguiar", "exportou os dados do contato Rafael Nogueira", "arquivo"],
  ["13:41:19", "Camila Reis", "atribuiu a conversa de Beatriz Lima a si", "usuario"],
] as const;

export function TelaAuditoria() {
  return (
    <div className="bg-bg text-text">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="m-0 flex items-center gap-2 text-[0.95rem] font-bold">
          <Icone nome="escudo" className="size-4 text-link" /> Registro de auditoria
        </p>
        <div className="flex gap-1.5">
          <Selo>somente acréscimo</Selo>
          <Selo>retenção de 5 anos</Selo>
        </div>
      </div>
      <table className="w-full border-collapse text-left text-meta">
        <thead>
          <tr className="text-text-subtle">
            <th scope="col" className="px-4 py-2 font-mono text-[0.65rem] font-medium tracking-wider uppercase">Hora</th>
            <th scope="col" className="px-2 py-2 font-mono text-[0.65rem] font-medium tracking-wider uppercase">Quem</th>
            <th scope="col" className="px-2 py-2 font-mono text-[0.65rem] font-medium tracking-wider uppercase">O que</th>
          </tr>
        </thead>
        <tbody>
          {REGISTROS.map(([hora, quem, o, icone], i) => (
            <tr
              key={hora}
              className="a-sobe border-t border-border"
              style={{ "--atraso": `${0.15 * i}s` } as React.CSSProperties}
            >
              <td className="px-4 py-2.5 font-mono text-[0.7rem] whitespace-nowrap text-text-subtle">{hora}</td>
              <td className="px-2 py-2.5 whitespace-nowrap">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Icone nome={icone} className="size-3.5 text-link" />
                  {quem}
                </span>
              </td>
              <td className="px-2 py-2.5 text-text-muted">{o}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

/** Dados separados por empresa: cada cofre só enxerga o próprio conteúdo. */
export function Isolamento() {
  const empresas = ["Empresa A", "Empresa B", "Empresa C"];
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="grid grid-cols-3 gap-2.5">
        {empresas.map((e, i) => (
          <div
            key={e}
            className="a-sobe flex flex-col items-center gap-2 rounded-field border border-border-strong bg-surface-elevated px-2 py-3.5"
            style={{ "--atraso": `${0.12 * i}s` } as React.CSSProperties}
          >
            <Icone nome="cadeado" className="size-5 text-link" />
            <span className="text-meta font-bold">{e}</span>
            <span className="font-mono text-[0.6rem] tracking-wider text-text-subtle uppercase">dados próprios</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-field border border-dashed border-border-strong px-3 py-2 text-meta text-text-muted">
        <Icone nome="escudo" className="size-4 shrink-0 text-ok" />
        Teste de isolamento a cada alteração do código
      </div>
    </div>
  );
}
