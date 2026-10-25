import { Icone, type NomeIcone } from "../ui/Icones";
import { Avatar, BotaoApp, Etiqueta, Selo, SeloDeCanal } from "../ui/Pecas";

/**
 * A Inbox do CRM, em HTML, com dados FICTÍCIOS. Replica a Inbox v2: trilho com rótulos, lista
 * (busca, Filtros, abas Fila/Minhas/Todas, linhas com selo de canal, pílula de espera, dono e
 * etiqueta), conversa (cabeçalho, faixa de status, balões, caixa de resposta) e ficha do lead.
 * Os três painéis aparecem conforme a LARGURA DO PRÓPRIO CONTÊINER (container queries).
 *
 * Na abertura roda uma sequência de ~8 s (a IA digita e responde, a conversa passa para uma pessoa,
 * a etapa vira "Agendado"). Os atrasos vêm de `--atraso`. O ESTADO FINAL é o padrão do CSS: sem
 * JavaScript, ou com movimento reduzido, a tela aparece já resolvida e parada.
 */

const MENU: { icone: NomeIcone; rotulo: string; ativo?: boolean }[] = [
  { icone: "inbox", rotulo: "Atendimento", ativo: true },
  { icone: "funil", rotulo: "CRM" },
  { icone: "agente", rotulo: "Agentes" },
  { icone: "conexao", rotulo: "Canais" },
  { icone: "grafico", rotulo: "Análise" },
];

type Conversa = {
  nome: string;
  tom: number;
  autor?: string;
  previa: string;
  hora: string;
  canal: "whatsapp" | "instagram";
  espera?: string;
  dono: "IA" | "Sem dono" | "Você";
  etiqueta?: string;
  naoLidas?: number;
  ativa?: boolean;
  esfriando?: boolean;
};

const CONVERSAS: Conversa[] = [
  { nome: "Rafael Nogueira", tom: 3, previa: "Vi o stories de vocês, queria saber os valores", hora: "13:58", canal: "instagram", espera: "38 min", dono: "Sem dono", etiqueta: "pediu-preço", naoLidas: 2 },
  { nome: "Marina Duarte", tom: 2, previa: "16h. E dá para parcelar?", hora: "14:03", canal: "whatsapp", espera: "2 min", dono: "IA", etiqueta: "indicação", naoLidas: 1, ativa: true },
  { nome: "Beatriz Lima", tom: 4, autor: "Você:", previa: "Posso remarcar para sexta? Combinado", hora: "13:41", canal: "whatsapp", dono: "Você", etiqueta: "retorno" },
  { nome: "Paulo Santos", tom: 1, autor: "IA:", previa: "Obrigado, até quinta! Qualquer dúvida...", hora: "12:20", canal: "whatsapp", dono: "IA", etiqueta: "agendado" },
  { nome: "Helena Costa", tom: 0, autor: "IA:", previa: "O endereço fica na Rua das Acácias, 120", hora: "11:47", canal: "instagram", dono: "IA", etiqueta: "primeira-vez" },
  { nome: "Tiago Moreira", tom: 5, previa: "Vou falar com minha esposa e te retorno", hora: "Ontem", canal: "whatsapp", dono: "IA", esfriando: true },
];

function Atraso({ s }: { s: number }) {
  return { "--atraso": `${s}s` } as React.CSSProperties;
}

/** Os dois tiques de "lida" (Phosphor Checks bold, tom info), como na meta do balão enviado. */
function Tiques() {
  return <Icone nome="dois" peso="bold" className="size-[15px] text-info-fg" />;
}

/** `.who`: o nome acima da primeira bolha do bloco, 12/700, na cor do autor. */
function Autor({ de, saida }: { de: "ia" | "pessoa"; saida: boolean }) {
  return (
    <span
      className={`mx-2 mb-1 flex items-center gap-[5px] text-meta font-bold ${saida ? "self-end" : ""} ${
        de === "ia" ? "text-accent-text" : "text-text-subtle"
      }`}
    >
      {de === "ia" ? <Icone nome="faiscas" className="size-3" /> : null}
      {de === "ia" ? "Agente IA" : "Camila"}
    </span>
  );
}

/** Balão: raio 18, canto de 6 do lado de quem fala, texto 15/1,42, hora de 11 px dentro. */
function Bolha({
  de,
  hora,
  atraso,
  inicio = true,
  children,
}: {
  de: "cliente" | "ia" | "pessoa";
  hora: string;
  atraso: number;
  inicio?: boolean;
  children: React.ReactNode;
}) {
  const saida = de !== "cliente";
  const tom =
    de === "ia"
      ? "pele-bolha-ia"
      : de === "pessoa"
        ? "border border-transparent bg-bubble-out"
        : "border border-border bg-bubble-in";
  return (
    <div
      className={`a-sobe flex max-w-[min(84%,36rem)] flex-col ${saida ? "self-end" : "self-start"} ${inicio ? "mt-2.5" : "mt-0.5"}`}
      style={Atraso({ s: atraso })}
    >
      {inicio && de !== "cliente" ? <Autor de={de} saida /> : null}
      <div
        className={`relative rounded-bubble py-[7px] pr-[11px] pb-[7px] pl-3 text-[15px] leading-[1.42] text-text ${tom} ${
          saida ? "rounded-br-bubble-tail" : "rounded-bl-bubble-tail"
        }`}
      >
        {children}
        <span
          className={`ml-2.5 inline-flex translate-y-[3px] items-center gap-[3px] align-baseline text-[11px] leading-none whitespace-nowrap ${
            de === "pessoa" ? "text-text-muted" : "text-text-subtle"
          }`}
        >
          {de === "ia" && <span className="font-semibold">IA</span>}
          {hora}
          {saida ? <Tiques /> : null}
        </span>
      </div>
    </div>
  );
}

/** Três pontinhos "digitando": invisíveis por padrão, aparecem e somem na sequência. */
function Digitando({ atraso }: { atraso: number }) {
  return (
    <div
      className="a-digitando self-end overflow-hidden rounded-bubble rounded-br-bubble-tail bg-bubble-ai"
      style={Atraso({ s: atraso })}
      aria-hidden="true"
    >
      <span className="a-ponto flex items-center gap-1 px-3.5 py-3">
        <i className="size-1.5 rounded-full bg-link" />
        <i className="size-1.5 rounded-full bg-link" />
        <i className="size-1.5 rounded-full bg-link" />
      </span>
    </div>
  );
}

/** Botão só com ícone (36 px no app; 32 aqui), `text-text-muted`. */
function BotaoIcone({ icone, ligado = false }: { icone: NomeIcone; ligado?: boolean }) {
  return (
    <span className={`grid size-8 place-items-center rounded-control ${ligado ? "bg-accent-soft text-accent-text" : "text-text-muted"}`}>
      <Icone nome={icone} className="size-[18px]" />
    </span>
  );
}

function LinhaDaLista({ c }: { c: Conversa }) {
  const naoLida = Boolean(c.naoLidas);
  return (
    <li
      className={`relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-border px-3.5 py-3 ${
        c.ativa ? "pele-selecionada" : ""
      }`}
    >
      {c.ativa ? <span aria-hidden="true" className="pele-grad-traco absolute inset-y-1.5 left-0 w-[3px] rounded-r-sm" /> : null}
      <div className="relative size-10 shrink-0">
        <Avatar nome={c.nome} tom={c.tom} tamanho="size-10" />
        <span
          className={`absolute -right-[3px] -bottom-[3px] grid size-[18px] place-items-center rounded-full text-white ring-2 ${
            c.ativa ? "ring-[#1d3943]" : "ring-surface"
          } ${c.canal === "whatsapp" ? "bg-[#1fa561]" : "bg-[#c13584]"}`}
        >
          <Icone nome={c.canal === "whatsapp" ? "chat" : "camera"} peso="bold" className="size-[11px]" />
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14.5px] text-text ${naoLida ? "font-bold" : "font-semibold"}`}>
            {c.nome}
          </span>
          <span className={`shrink-0 text-xs tabular-nums ${naoLida ? "font-semibold text-accent-text" : "text-text-subtle"}`}>
            {c.hora}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={`m-0 min-w-0 flex-1 truncate text-[13.5px] ${naoLida ? "text-text" : c.esfriando ? "text-warning-fg" : "text-text-muted"}`}>
            {c.autor ? <span className="text-text-subtle">{c.autor} </span> : null}
            {c.esfriando ? "Sem resposta há 2 h" : c.previa}
          </p>
          {c.naoLidas ? (
            <span className="pele-grad-contador inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums">
              {c.naoLidas}
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {c.espera ? (
            <Selo tom={c.dono === "Sem dono" ? "crit" : "info"}>
              <Icone nome="relogio" className="size-3" />
              {c.espera}
            </Selo>
          ) : null}
          {c.ativa ? (
            <span className="relative inline-grid">
              <span className="a-troca-a col-start-1 row-start-1">
                <Selo tom="ia">IA</Selo>
              </span>
              <span className="a-troca-b col-start-1 row-start-1">
                <Selo tom="pessoa">Camila</Selo>
              </span>
            </span>
          ) : (
            <Selo tom={c.dono === "IA" ? "ia" : c.dono === "Sem dono" ? "semdono" : "pessoa"}>{c.dono}</Selo>
          )}
          {c.etiqueta ? <Etiqueta>{c.etiqueta}</Etiqueta> : null}
        </div>
      </div>
    </li>
  );
}

export function TelaInbox({ className = "" }: { className?: string }) {
  return (
    <div className={`@container bg-bg text-text ${className}`}>
      <div className="flex h-[30rem] min-h-0 @3xl:h-[34rem]">
        {/* Trilho de navegação: ícone e rótulo de 10,5 px, o ativo em cartão */}
        <nav className="hidden w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-bg py-2.5 @md:flex">
          <span className="mb-1.5 grid size-10 place-items-center rounded-xl bg-[#0e6d52] text-[13px] font-bold text-white">
            SA
          </span>
          {MENU.map((m) => (
            <span
              key={m.rotulo}
              className={`flex w-[62px] flex-col items-center gap-[3px] rounded-lg py-1.5 ${
                m.ativo ? "pele-ativo-trilho text-text" : "text-text-muted"
              }`}
            >
              <Icone nome={m.icone} className="size-5" />
              <span className="text-rail font-semibold tracking-[-0.01em]">{m.rotulo}</span>
            </span>
          ))}
          <span className="mt-auto flex flex-col items-center gap-[3px] text-text-muted">
            <Icone nome="filtro" className="size-5" />
            <span className="text-rail font-semibold">Ajustes</span>
          </span>
        </nav>

        {/* Lista de conversas */}
        <section className="hidden w-[17.5rem] shrink-0 flex-col border-r border-border bg-surface @3xl:flex">
          <div className="flex flex-col gap-2.5 p-3">
            <div className="flex h-9 items-center gap-2 rounded-field border border-border-strong bg-surface-2 px-3 text-[13px] text-text-subtle">
              <Icone nome="busca" className="size-4" />
              <span className="flex-1 truncate">Nome, telefone ou mensagem</span>
              <span className="flex items-center gap-1 font-semibold text-text-muted">
                <Icone nome="filtro" className="size-3.5" /> Filtros
              </span>
            </div>
            <div className="pele-seg flex gap-0.5 rounded-field border border-border p-[3px] text-meta font-semibold">
              {[
                ["Fila", "3"],
                ["Minhas", "2"],
                ["Todas", "8"],
                ["Mais", ""],
              ].map(([t, n], i) => (
                <span
                  key={t}
                  className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-[7px] ${
                    i === 2 ? "pele-seg-item-on text-text" : "text-text-muted"
                  }`}
                >
                  {t}
                  {n ? <span className="text-[11px] font-medium text-text-subtle">{n}</span> : null}
                  {t === "Mais" ? <Icone nome="chevron" peso="bold" className="size-2.5" /> : null}
                </span>
              ))}
            </div>
          </div>
          <p className="m-0 flex items-center justify-between border-t border-border px-3.5 py-1.5 text-meta font-semibold text-text-subtle">
            Abertas <span className="tabular-nums">8</span>
          </p>
          <ul className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-hidden border-t border-border p-0">
            {CONVERSAS.map((c) => (
              <LinhaDaLista key={c.nome} c={c} />
            ))}
          </ul>
        </section>

        {/* Conversa */}
        <section className="flex min-w-0 flex-1 flex-col bg-thread">
          <header className="flex min-h-16 items-center gap-3 border-b border-border bg-surface py-2.5 pr-3 pl-[18px]">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="m-0 truncate text-base font-bold whitespace-nowrap">Marina Duarte</p>
                <span className="shrink-0 rounded-full bg-success-bg px-2 py-px text-xs font-semibold text-success-fg">
                  Aberta
                </span>
              </div>
              <p className="m-0 mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-[13px] whitespace-nowrap text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="grid size-3.5 place-items-center rounded-full bg-[#1fa561] text-white">
                    <Icone nome="chat" peso="bold" className="size-2" />
                  </span>
                  WhatsApp
                </span>
                <i aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-border-strong" />
                <span className="truncate font-mono text-xs">+55 21 9•••• ••••</span>
                <i aria-hidden="true" className="hidden h-1 w-1 shrink-0 rounded-full bg-border-strong @xl:block" />
                <span className="relative hidden truncate font-semibold @xl:inline-grid">
                  <span className="a-troca-a col-start-1 row-start-1">IA atendendo</span>
                  <span className="a-troca-b col-start-1 row-start-1">Camila está atendendo</span>
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="relative hidden @xl:inline-grid">
                <span className="a-troca-a col-start-1 row-start-1 justify-self-end">
                  <BotaoApp>Assumir</BotaoApp>
                </span>
                <span className="a-troca-b col-start-1 row-start-1 justify-self-end">
                  <BotaoApp variante="contorno">Devolver à IA</BotaoApp>
                </span>
              </span>
              <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border @xl:block" />
              <span className="hidden @max-5xl:contents"><BotaoIcone icone="trocar" /><BotaoIcone icone="alarme" /></span>
              <BotaoIcone icone="concluir" />
              <BotaoIcone icone="opcoes" />
              <span className="hidden @5xl:block">
                <BotaoIcone icone="painel" ligado />
              </span>
            </div>
          </header>

          {/* Faixa de status: janela de 24 h, espera e origem */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border bg-surface px-4 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-text-muted">
              <Icone nome="relogio" className="size-3.5" />
              Janela 24h: 21h 48min
              <span className="h-1 w-14 overflow-hidden rounded-full bg-border-strong">
                <span className="block h-full w-[90%] rounded-full bg-success-fg" />
              </span>
            </span>
            <span className="font-semibold text-warning-fg">Esperando há 14 min</span>
            <span className="ml-auto hidden h-6 items-center rounded-md border border-border px-2 font-medium text-text-muted @2xl:inline-flex">
              Entrou por Instagram: Limpeza de pele
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 py-3 @3xl:px-7">
            <p className="pele-dia m-0 mb-1 self-center rounded-[10px] border px-3 py-1 text-xs font-semibold text-text">Hoje</p>
            <Bolha de="cliente" hora="14:02" atraso={0.5}>
              Oi! Vocês fazem limpeza de pele? Tem horário amanhã?
            </Bolha>
            <div className="mt-2.5 grid">
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
              className="a-sobe m-0 mt-3 flex items-center justify-center gap-2 border-y border-dashed border-border-strong py-1.5 text-center text-meta font-medium text-text-muted"
              style={Atraso({ s: 5.4 })}
            >
              <Icone nome="usuario" className="size-3.5 text-info-fg" />
              Pergunta de pagamento: a IA passou o atendimento para Camila, 14:03
            </p>
            <Bolha de="pessoa" hora="14:05" atraso={6.4}>
              Oi, Marina, aqui é a Camila. Já vi o histórico: limpeza de pele amanhã às 16h. Te passo as condições de
              pagamento agora.
            </Bolha>
          </div>

          {/* Caixa de resposta: abas, dica e a faixa de quem atende */}
          <footer className="flex flex-col gap-2 border-t border-border bg-surface px-4 pt-2.5 pb-3">
            <div className="flex items-center gap-1 text-[13px] font-semibold">
              <span className="rounded-full bg-text px-3 py-1 text-bg">Responder</span>
              <span className="px-3 py-1 text-text-muted">Nota interna</span>
              <span className="ml-auto hidden text-xs font-normal text-text-subtle @2xl:block">
                Enter envia, Shift+Enter quebra linha
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-field border border-border-strong bg-surface-2 px-3 py-2 text-[13px]">
              <Icone nome="faiscas" className="size-4 shrink-0 text-accent-text" />
              <span className="relative inline-grid min-w-0 flex-1">
                <span className="a-troca-a col-start-1 row-start-1 truncate">
                  <b>A IA está atendendo.</b> <span className="text-text-muted">Ao assumir, o automático para nesta conversa.</span>
                </span>
                <span className="a-troca-b col-start-1 row-start-1 truncate text-text-subtle">Escreva uma mensagem...</span>
              </span>
              <span className="relative hidden shrink-0 @lg:inline-grid">
                <span className="a-troca-a col-start-1 row-start-1">
                  <BotaoApp>Assumir e responder</BotaoApp>
                </span>
                <span className="a-troca-b col-start-1 row-start-1">
                  <span className="grid size-8 place-items-center rounded-control bg-(image:--degrade) text-white">
                    <Icone nome="enviar" peso="bold" className="size-4" />
                  </span>
                </span>
              </span>
            </div>
          </footer>
        </section>

        {/* Ficha do lead */}
        <aside className="hidden w-[17rem] shrink-0 flex-col overflow-hidden border-l border-border bg-surface @5xl:flex">
          <div className="flex items-center gap-3 px-4 pt-4">
            <Avatar nome="Marina Duarte" tom={2} tamanho="size-11" />
            <div className="min-w-0">
              <p className="m-0 truncate text-lg leading-tight font-bold">Marina Duarte</p>
              <p className="m-0 mt-0.5 flex items-center gap-1.5 font-mono text-[13px] text-text-muted">
                +55 21 9•••• ••••
                <Icone nome="copiar" className="size-3.5 text-text-subtle" />
              </p>
            </div>
          </div>
          <p className="m-0 px-4 pt-3 text-[13px]">
            <span className="text-text-muted">Assunto:</span> <b>Agendar limpeza de pele</b>
          </p>
          <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">
            <Etiqueta>indicação</Etiqueta>
            <Etiqueta>limpeza-de-pele</Etiqueta>
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-xs text-text-muted">
              <Icone nome="mais" peso="bold" className="size-2.5" /> Etiqueta
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 px-4 pt-3 text-[13px] font-semibold">
            <span className="flex h-9 items-center justify-center gap-1.5 rounded-control border border-warning-line bg-warning-bg text-warning-fg">
              <Icone nome="tarefa" className="size-4" /> Próximo passo
            </span>
            <span className="flex h-9 items-center justify-center gap-1.5 rounded-control border border-border-strong">
              <Icone nome="usuario" className="size-4" /> Detalhes
            </span>
            <span className="flex h-9 items-center justify-center gap-1.5 rounded-control border border-border-strong">
              <Icone nome="nota" className="size-4" /> Obs
            </span>
          </div>
          <div className="mt-3.5 flex gap-3 border-b border-border px-4 text-[13px] font-semibold text-text-muted">
            {["Resumo", "Negócios", "Empresa", "Atividade"].map((t, i) => (
              <span
                key={t}
                className={`relative pb-2.5 ${i === 0 ? "text-text after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent-text" : ""}`}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 px-4 pt-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-control border border-warning-line bg-warning-bg text-warning-fg">
                <Icone nome="tarefa" className="size-[18px]" />
              </span>
              <div>
                <p className="m-0 text-[14px] leading-tight font-bold">Próximo passo</p>
                <p className="m-0 text-xs text-text-muted">Confirmar horário de amanhã</p>
              </div>
            </div>
            <p className="m-0 flex items-start gap-2 rounded-control border border-warning-line bg-warning-bg px-3 py-2 text-xs font-semibold text-warning-fg">
              <Icone nome="alerta" className="mt-px size-3.5 shrink-0" />
              <span className="relative inline-grid">
                <span className="a-troca-a col-start-1 row-start-1">Sem próximo passo. Lead sem tarefa some do radar da equipe.</span>
                <span className="a-troca-b col-start-1 row-start-1">Tarefa marcada: confirmar a sessão de amanhã, 16h.</span>
              </span>
            </p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Etapa</span>
              <span className="relative inline-grid" style={{ "--troca": "7.4s" } as React.CSSProperties}>
                <span className="a-troca-a col-start-1 row-start-1 justify-self-end">
                  <Selo tom="aviso">Qualificando</Selo>
                </span>
                <span className="a-troca-b col-start-1 row-start-1 justify-self-end">
                  <Selo tom="ok">Agendado</Selo>
                </span>
              </span>
            </div>
            <p className="m-0 mt-1 text-xs font-bold">O que fazer</p>
            <span className="rounded-field border border-border-strong bg-surface-2 px-3 py-2 text-[13px] text-text-subtle">
              Ex.: ligar para confirmar a consulta
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
