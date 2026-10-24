import { Icone, type NomeIcone } from "../ui/Icones";
import { Avatar, CanalChip, Selo } from "../ui/Pecas";

/**
 * A Inbox do CRM, em HTML, com dados FICTÍCIOS. Três painéis (lista, conversa, ficha do lead) que
 * aparecem conforme a LARGURA DO PRÓPRIO CONTÊINER (container queries), como o app real faz com a
 * janela: estreito mostra só a conversa; médio soma a lista; largo soma a ficha.
 *
 * Na abertura roda uma sequência de ~8 s (a IA digita e responde, a conversa passa para uma pessoa,
 * a etapa vira "Agendado"). Os atrasos vêm de `--atraso`. O ESTADO FINAL é o padrão do CSS: sem
 * JavaScript, ou com movimento reduzido, a tela aparece já resolvida e parada.
 */

const MENU: { icone: NomeIcone; ativo?: boolean }[] = [
  { icone: "inbox", ativo: true },
  { icone: "funil" },
  { icone: "radar" },
  { icone: "agente" },
  { icone: "grafico" },
  { icone: "conexao" },
];

const CONVERSAS = [
  { nome: "Marina Duarte", tom: 2, previa: "16h. E dá para parcelar?", hora: "14:03", canal: "whatsapp", dono: "Camila", ativa: true },
  { nome: "Rafael Nogueira", tom: 3, previa: "Vi o stories de vocês, queria saber os valores", hora: "13:58", canal: "instagram", dono: "IA", naoLidas: 2 },
  { nome: "Beatriz Lima", tom: 4, previa: "Posso remarcar para sexta?", hora: "13:41", canal: "whatsapp", dono: "Camila" },
  { nome: "Paulo Santos", tom: 1, previa: "Obrigado, até quinta!", hora: "12:20", canal: "whatsapp", dono: "IA" },
  { nome: "Helena Costa", tom: 0, previa: "Qual o endereço da clínica?", hora: "11:47", canal: "instagram", dono: "IA" },
  { nome: "Tiago Moreira", tom: 5, previa: "Vou falar com minha esposa e te retorno", hora: "Ontem", canal: "whatsapp", dono: "IA", esfriando: true },
] as const;

function Atraso({ s }: { s: number }) {
  return { "--atraso": `${s}s` } as React.CSSProperties;
}

function Bolha({
  de,
  hora,
  atraso,
  children,
}: {
  de: "cliente" | "ia" | "pessoa";
  hora: string;
  atraso: number;
  children: React.ReactNode;
}) {
  const saida = de !== "cliente";
  return (
    <div
      className={`a-sobe flex max-w-[86%] flex-col gap-1 rounded-[14px] px-3.5 py-2.5 text-message leading-snug ${
        saida
          ? de === "ia"
            ? "self-end rounded-br-md bg-[#12303a] text-text"
            : "self-end rounded-br-md bg-[#15324a] text-text"
          : "self-start rounded-bl-md bg-surface-elevated text-text"
      }`}
      style={Atraso({ s: atraso })}
    >
      <span className="flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider text-text-subtle uppercase">
        {de === "ia" ? (
          <>
            <Icone nome="agente" className="size-3" /> Agente de IA
          </>
        ) : de === "pessoa" ? (
          <>
            <Icone nome="usuario" className="size-3" /> Camila
          </>
        ) : (
          "Marina"
        )}
        <span aria-hidden="true">·</span>
        {hora}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Três pontinhos "digitando": invisíveis por padrão, aparecem e somem na sequência. */
function Digitando({ atraso }: { atraso: number }) {
  return (
    <div
      className="a-digitando self-end overflow-hidden rounded-full bg-[#12303a]"
      style={Atraso({ s: atraso })}
      aria-hidden="true"
    >
      <span className="a-ponto flex items-center gap-1 px-3.5 py-2.5">
        <i className="size-1.5 rounded-full bg-link" />
        <i className="size-1.5 rounded-full bg-link" />
        <i className="size-1.5 rounded-full bg-link" />
      </span>
    </div>
  );
}

export function TelaInbox({ className = "" }: { className?: string }) {
  return (
    <div className={`@container bg-bg text-text ${className}`}>
      <div className="flex h-[27.5rem] min-h-0 @3xl:h-[30rem]">
        {/* Trilho de navegação */}
        <nav className="hidden w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-[#0b0c0f] py-3 @md:flex">
          <span className="mb-2 grid size-8 place-items-center rounded-lg bg-surface-elevated text-[0.7rem] font-bold text-link">
            V
          </span>
          {MENU.map((m) => (
            <span
              key={m.icone}
              className={`grid size-9 place-items-center rounded-lg ${
                m.ativo ? "bg-accent-soft text-link" : "text-text-subtle"
              }`}
            >
              <Icone nome={m.icone} className="size-[1.1rem]" />
            </span>
          ))}
          <span className="mt-auto">
            <Avatar nome="Camila Reis" tom={1} tamanho="size-8" />
          </span>
        </nav>

        {/* Lista de conversas */}
        <section className="hidden w-[17.5rem] shrink-0 flex-col border-r border-border bg-surface/60 @3xl:flex">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <p className="m-0 text-[0.95rem] font-bold">Inbox</p>
            <span className="flex items-center gap-1 rounded-md bg-bg px-2 py-1 text-meta text-text-subtle">
              <Icone nome="busca" className="size-3" /> Buscar
            </span>
          </div>
          <div className="flex gap-1 px-3 pb-2 text-meta font-semibold">
            {["Todas", "Minhas", "IA", "Sem dono"].map((t, i) => (
              <span
                key={t}
                className={`rounded-full px-2.5 py-1 ${i === 0 ? "bg-surface-elevated text-text" : "text-text-subtle"}`}
              >
                {t}
              </span>
            ))}
          </div>
          <ul className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-hidden p-0">
            {CONVERSAS.map((c) => (
              <li
                key={c.nome}
                className={`flex gap-2.5 border-t border-border px-3 py-2.5 ${
                  "ativa" in c && c.ativa ? "bg-accent-soft" : ""
                }`}
              >
                <Avatar nome={c.nome} tom={c.tom} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 truncate text-ui font-semibold">{c.nome}</p>
                    <span className="shrink-0 font-mono text-[0.65rem] text-text-subtle">{c.hora}</span>
                  </div>
                  <p
                    className={`m-0 truncate text-meta ${"esfriando" in c && c.esfriando ? "text-warn" : "text-text-muted"}`}
                  >
                    {"esfriando" in c && c.esfriando ? "Sem resposta há 2 h" : c.previa}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <CanalChip canal={c.canal} />
                    {"ativa" in c && c.ativa ? (
                      <span className="relative inline-grid">
                        <span className="a-troca-a col-start-1 row-start-1">
                          <Selo tom="ia">IA</Selo>
                        </span>
                        <span className="a-troca-b col-start-1 row-start-1">
                          <Selo tom="info">Camila</Selo>
                        </span>
                      </span>
                    ) : (
                      <Selo tom={c.dono === "IA" ? "ia" : "info"}>{c.dono}</Selo>
                    )}
                    {"naoLidas" in c && c.naoLidas ? (
                      <span className="ml-auto grid size-4 place-items-center rounded-full bg-accent text-[0.6rem] font-bold text-white">
                        {c.naoLidas}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Conversa */}
        <section className="flex min-w-0 flex-1 flex-col bg-bg">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Avatar nome="Marina Duarte" tom={2} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[0.95rem] font-bold">Marina Duarte</p>
              <p className="m-0 flex items-center gap-1.5 text-meta text-text-subtle">
                <CanalChip canal="whatsapp" />
                Clínica de estética
              </p>
            </div>
            <span className="relative inline-grid">
              <span className="a-troca-a col-start-1 row-start-1">
                <Selo tom="ia">Atendida pela IA</Selo>
              </span>
              <span className="a-troca-b col-start-1 row-start-1">
                <Selo tom="info">Com a Camila</Selo>
              </span>
            </span>
          </header>

          <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden px-4 py-4">
            <Bolha de="cliente" hora="14:02" atraso={0.5}>
              Oi! Vocês fazem limpeza de pele? Tem horário amanhã?
            </Bolha>
            <div className="grid">
              <div className="col-start-1 row-start-1 flex items-end justify-end">
                <Digitando atraso={1.2} />
              </div>
              <div className="col-start-1 row-start-1 flex justify-end">
                <Bolha de="ia" hora="14:02" atraso={2.6}>
                  Oi, Marina! Fazemos sim, e a sessão leva cerca de 1 hora. Amanhã tenho 10h30 ou 16h. Qual fica melhor?
                </Bolha>
              </div>
            </div>
            <Bolha de="cliente" hora="14:03" atraso={4.2}>
              16h. E dá para parcelar?
            </Bolha>
            <p
              className="a-sobe m-0 flex items-center justify-center gap-2 border-y border-dashed border-border-strong py-1.5 text-center font-mono text-[0.68rem] text-text-muted"
              style={Atraso({ s: 5.4 })}
            >
              <Icone nome="usuario" className="size-3 text-[#9db4ff]" />
              Pergunta de pagamento · a IA passou o atendimento para Camila · 14:03
            </p>
            <Bolha de="pessoa" hora="14:05" atraso={6.4}>
              Oi, Marina, aqui é a Camila. Já vi o histórico: limpeza de pele amanhã às 16h. Te passo as condições
              de pagamento agora.
            </Bolha>
          </div>

          <footer className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <span className="flex-1 rounded-field bg-surface-elevated px-3 py-2 text-ui text-text-subtle">
              Escreva uma mensagem
            </span>
            <span className="grid size-9 place-items-center rounded-field bg-(image:--degrade) text-white">
              <Icone nome="enviar" className="size-4" />
            </span>
          </footer>
        </section>

        {/* Ficha do lead */}
        <aside className="hidden w-[16rem] shrink-0 flex-col gap-3.5 border-l border-border bg-surface/60 p-4 @5xl:flex">
          <div className="flex items-center gap-2.5">
            <Avatar nome="Marina Duarte" tom={2} tamanho="size-10" />
            <div>
              <p className="m-0 text-ui font-bold">Marina Duarte</p>
              <p className="m-0 font-mono text-[0.68rem] text-text-subtle">+55 21 9•••• ••••</p>
            </div>
          </div>
          <dl className="m-0 flex flex-col gap-2.5 text-meta">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-text-subtle">Funil</dt>
              <dd className="m-0 font-semibold">Clínica de estética</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-text-subtle">Etapa</dt>
              <dd className="m-0">
                <span className="relative inline-grid" style={{ "--troca": "7.4s" } as React.CSSProperties}>
                  <span className="a-troca-a col-start-1 row-start-1">
                    <Selo tom="aviso">Qualificando</Selo>
                  </span>
                  <span className="a-troca-b col-start-1 row-start-1">
                    <Selo tom="ok">Agendado</Selo>
                  </span>
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-text-subtle">Dono</dt>
              <dd className="m-0 font-semibold">
                <span className="relative inline-grid">
                  <span className="a-troca-a col-start-1 row-start-1 justify-self-end">Agente de IA</span>
                  <span className="a-troca-b col-start-1 row-start-1 justify-self-end">Camila Reis</span>
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-text-subtle">Origem</dt>
              <dd className="m-0 font-semibold">Instagram</dd>
            </div>
          </dl>
          <div>
            <p className="m-0 mb-1.5 font-mono text-[0.65rem] tracking-wider text-text-subtle uppercase">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5">
              <Selo>limpeza de pele</Selo>
              <Selo>indicação</Selo>
            </div>
          </div>
          <div>
            <p className="m-0 mb-1.5 font-mono text-[0.65rem] tracking-wider text-text-subtle uppercase">Tarefas</p>
            <p className="m-0 flex items-start gap-2 rounded-card border border-border bg-surface-elevated px-2.5 py-2 text-meta">
              <Icone nome="tarefa" className="mt-0.5 size-3.5 shrink-0 text-link" />
              Confirmar horário de amanhã, 16h
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
