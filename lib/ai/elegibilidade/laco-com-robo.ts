/**
 * Freio de laço com robô: a IA e uma URA/autoresposta do outro lado trocando
 * mensagens sem parar (Lior, 28/10: 149 da IA contra 298 de entrada em 24h).
 * Função PURA; a leitura e o efeito moram em `consulta-laco.ts`.
 */

export const JANELA_LACO_MS = 60 * 60 * 1000;
/** Bolhas da IA na janela (o agente divide a resposta em várias bolhas curtas). */
export const LIMITE_VOLUME_IA = 16;
/** Mensagens do cliente na mesma janela: exige tráfego dos dois lados. */
export const LIMITE_VOLUME_CLIENTE = 12;
export const ENTRADAS_ANALISADAS = 12;
export const LIMITE_REPETICAO = 3;
export const TAMANHO_MINIMO_REPETIDO = 20;

export interface MensagemDaConversa {
  direcao: "inbound" | "outbound";
  texto: string | null;
  enviadoEm: Date;
  enviadaPelaIa: boolean;
}

export interface DecisaoDeLaco {
  laco: boolean;
  motivo: "volume" | "repeticao" | null;
}

export function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectarLacoComRobo(
  mensagens: MensagemDaConversa[],
  agora: Date = new Date(),
): DecisaoDeLaco {
  const desde = agora.getTime() - JANELA_LACO_MS;
  const naJanela = mensagens.filter((m) => m.enviadoEm.getTime() >= desde);

  const ia = naJanela.filter((m) => m.direcao === "outbound" && m.enviadaPelaIa).length;
  const cliente = naJanela.filter((m) => m.direcao === "inbound").length;
  if (ia >= LIMITE_VOLUME_IA && cliente >= LIMITE_VOLUME_CLIENTE) {
    return { laco: true, motivo: "volume" };
  }

  // Humano repetindo "me atende" sem a IA responder não é laço.
  if (ia < LIMITE_REPETICAO) return { laco: false, motivo: null };

  const contagem = new Map<string, number>();
  const entradas = naJanela
    .filter((m) => m.direcao === "inbound")
    .sort((a, b) => b.enviadoEm.getTime() - a.enviadoEm.getTime())
    .slice(0, ENTRADAS_ANALISADAS);
  for (const m of entradas) {
    const n = normalizarTexto(m.texto ?? "");
    if (n.length < TAMANHO_MINIMO_REPETIDO) continue;
    const c = (contagem.get(n) ?? 0) + 1;
    if (c >= LIMITE_REPETICAO) return { laco: true, motivo: "repeticao" };
    contagem.set(n, c);
  }
  return { laco: false, motivo: null };
}
