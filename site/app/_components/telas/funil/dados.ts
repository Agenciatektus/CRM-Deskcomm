/**
 * Dados FICTÍCIOS do funil de exemplo. Nada aqui vem de cliente real: nomes, valores e telefones
 * são inventados (os telefones são mascarados na tela). O vocabulário muda por funil, como a
 * configuração de funil do CRM faz.
 */

export const DONO_LOGADO = "Camila";

export type Canal = "whatsapp" | "instagram";

export type Cartao = {
  id: string;
  nome: string;
  tom: number;
  canal: Canal;
  /** Valor do negócio em reais; 0 quando ainda não há proposta. */
  valor: number;
  /** "IA" ou o nome de quem cuida. */
  dono: string;
  ultima: string;
  etiquetas: string[];
  naoLidas?: number;
  /** Texto do tempo no rodapé: "há 3 h" ou "esperando resposta há 2 d". */
  tempo: string;
  parado?: string;
  proximo?: string;
  atrasado?: boolean;
  /** O agente propõe uma ação e espera Aprovar ou Ignorar. */
  proposta?: string;
  destaque?: boolean;
};

export type Etapa = { nome: string; cor: string; probabilidade?: number; cartoes: Cartao[] };
export type Funil = { id: string; nome: string; etapas: Etapa[] };

function c(
  id: string,
  nome: string,
  tom: number,
  canal: Canal,
  valor: number,
  dono: string,
  ultima: string,
  tempo: string,
  etiqueta: string,
  o: Partial<Cartao> = {},
): Cartao {
  return { id, nome, tom, canal, valor, dono, ultima, tempo, etiquetas: [etiqueta], ...o };
}

const CORES = ["#65a7fa", "#ffb848", "#c4a1f4", "#2bc88f", "#41ce90"];
const etapa = (i: number, nome: string, cartoes: Cartao[], probabilidade?: number): Etapa => ({
  nome,
  cor: CORES[i] ?? "#65a7fa",
  probabilidade,
  cartoes,
});

export const FUNIS: Funil[] = [
  {
    id: "clinica",
    nome: "Clínica de estética",
    etapas: [
      etapa(0, "Primeiro contato", [
        c("c1", "Rafael Nogueira", 3, "instagram", 0, "IA", "Vi o stories de vocês, queria saber os valores", "há 12 min", "pediu-preço", { naoLidas: 2 }),
        c("c2", "Beatriz Lima", 4, "whatsapp", 0, "IA", "Oi, vocês fazem limpeza de pele?", "há 40 min", "primeira-vez"),
        c("c3", "Camilo Prado", 1, "instagram", 0, "IA", "Qual o endereço da clínica?", "há 1 h", "anúncio-meta"),
      ]),
      etapa(1, "Avaliação", [
        c("c4", "Paulo Santos", 1, "whatsapp", 640, "IA", "Pode ser quinta de manhã", "há 3 h", "agendado", { proximo: "Confirmar avaliação, quinta 10h" }),
        c("c5", "Tiago Moreira", 5, "whatsapp", 900, "IA", "Vou falar com minha esposa e te retorno", "há 2 d", "retorno", { parado: "2 d" }),
        c("c6", "Sofia Lacerda", 0, "whatsapp", 1000, DONO_LOGADO, "Mandei as fotos que você pediu", "há 5 h", "indicação", { proximo: "Enviar o antes e depois", atrasado: true }),
      ]),
      etapa(2, "Proposta enviada", [
        c("c7", "Helena Costa", 0, "instagram", 1800, DONO_LOGADO, "Vou ver aqui e te falo", "há 1 d", "primeira-vez", { proximo: "Ligar amanhã, 9h", proposta: "enviar retomada amanhã, 10h" }),
        c("c8", "Larissa Mota", 2, "whatsapp", 2400, DONO_LOGADO, "Tem desconto no pacote de 6?", "esperando resposta há 2 d", "pediu-preço", { proximo: "Cobrar retorno da proposta", atrasado: true }),
      ], 0.5),
      etapa(3, "Negociação", [
        c("c9", "Marina Duarte", 2, "whatsapp", 2400, DONO_LOGADO, "16h. E dá para parcelar?", "há 20 min", "indicação", { naoLidas: 1, destaque: true, proximo: "Confirmar horário de amanhã" }),
        c("c10", "Débora Reis", 4, "whatsapp", 3000, DONO_LOGADO, "Fechado, me manda o link", "há 6 h", "retorno", { proximo: "Combinar parcelamento" }),
      ], 0.8),
      etapa(4, "Tratamento fechado", [
        c("c11", "Luciana Ramos", 4, "whatsapp", 3100, DONO_LOGADO, "Obrigada, até terça!", "ontem", "agendado"),
        c("c12", "Renato Alves", 3, "whatsapp", 2200, DONO_LOGADO, "Perfeito, combinado", "há 2 d", "agendado"),
      ]),
    ],
  },
  {
    id: "curso",
    nome: "Lançamento do curso",
    etapas: [
      etapa(0, "Lead novo", [
        c("k1", "Gustavo Alves", 3, "instagram", 0, "IA", "Vi o anúncio da aula gratuita", "há 8 min", "anúncio-meta", { naoLidas: 1 }),
        c("k2", "Carla Mendes", 0, "whatsapp", 0, "IA", "Quando abre a turma?", "há 1 h", "primeira-vez"),
      ]),
      etapa(1, "Aula assistida", [
        c("k3", "Diego Farias", 1, "whatsapp", 497, "IA", "Assisti inteira, gostei", "há 5 h", "aula-ao-vivo", { proximo: "Enviar o link da turma" }),
        c("k4", "Aline Prado", 5, "whatsapp", 497, "IA", "Depois eu vejo o valor", "há 2 d", "retorno", { parado: "2 d" }),
      ]),
      etapa(2, "Carrinho", [
        c("k5", "Renata Souza", 4, "instagram", 497, DONO_LOGADO, "Dá para pagar no PIX?", "há 1 d", "pediu-preço", { proximo: "Mandar a chave do PIX", atrasado: true, proposta: "oferecer o bônus de 24 h" }),
      ], 0.5),
      etapa(3, "Checkout iniciado", [
        c("k6", "Felipe Costa", 2, "whatsapp", 497, DONO_LOGADO, "O cartão não passou", "há 35 min", "checkout", { naoLidas: 2, destaque: true, proximo: "Ajudar com o pagamento" }),
        c("k7", "Bianca Torres", 0, "whatsapp", 497, "IA", "Estou pagando agora", "há 2 h", "checkout"),
      ], 0.8),
      etapa(4, "Pago", [
        c("k8", "Mariana Vaz", 1, "whatsapp", 497, DONO_LOGADO, "Recebi o acesso, obrigada", "ontem", "aluno"),
      ]),
    ],
  },
  {
    id: "servicos",
    nome: "Orçamentos de serviço",
    etapas: [
      etapa(0, "Pedido de orçamento", [
        c("s1", "Condomínio Aurora", 3, "whatsapp", 0, "IA", "Precisamos pintar a fachada", "há 25 min", "pintura", { naoLidas: 1 }),
        c("s2", "Oficina do Zé", 0, "whatsapp", 0, "IA", "Troca de piso, 80 m²", "há 2 h", "piso"),
      ]),
      etapa(1, "Visita técnica", [
        c("s3", "Clínica Sorriso", 1, "whatsapp", 4200, DONO_LOGADO, "Pode vir terça às 14h", "há 1 d", "reforma", { proximo: "Visita terça, 14h" }),
        c("s4", "Padaria Central", 5, "instagram", 1900, "IA", "Me passa uma estimativa", "há 3 d", "pintura", { parado: "3 d" }),
      ]),
      etapa(2, "Proposta", [
        c("s5", "Escola Horizonte", 4, "whatsapp", 8600, DONO_LOGADO, "Vamos analisar com a diretoria", "esperando resposta há 2 d", "reforma", { proximo: "Ligar para a diretoria", atrasado: true, proposta: "enviar retomada amanhã, 10h" }),
      ], 0.5),
      etapa(3, "Negociação", [
        c("s6", "Rede Vitória", 2, "whatsapp", 12000, DONO_LOGADO, "Fecha se parcelar em três vezes", "há 4 h", "rede", { destaque: true, naoLidas: 1, proximo: "Responder sobre o parcelamento" }),
        c("s7", "Loja Mar Azul", 0, "whatsapp", 5400, DONO_LOGADO, "Aprovado pelo sócio", "há 1 d", "reforma"),
      ], 0.8),
      etapa(4, "Fechado", [
        c("s8", "Studio Pilates", 4, "whatsapp", 3300, DONO_LOGADO, "Pode começar segunda", "ontem", "piso"),
      ]),
    ],
  },
];

export type Chip = "meus" | "atrasados" | "semPasso" | "parados";

export const CHIPS: { id: Chip; rotulo: string }[] = [
  { id: "meus", rotulo: "Meus" },
  { id: "atrasados", rotulo: "Atrasados" },
  { id: "semPasso", rotulo: "Sem próximo passo" },
  { id: "parados", rotulo: "Parados" },
];

const TESTE: Record<Chip, (k: Cartao) => boolean> = {
  meus: (k) => k.dono === DONO_LOGADO,
  atrasados: (k) => !!k.atrasado,
  semPasso: (k) => !k.proximo,
  parados: (k) => !!k.parado,
};

export function passa(k: Cartao, ativos: ReadonlySet<Chip>, busca: string): boolean {
  for (const a of ativos) if (!TESTE[a](k)) return false;
  const q = busca.trim().toLowerCase();
  return !q || k.nome.toLowerCase().includes(q) || k.etiquetas.some((e) => e.includes(q));
}

/** Quantos cartões abertos do funil cada chip pegaria (a última etapa é a de fechados). */
export function contagem(f: Funil, chip: Chip): number {
  return f.etapas
    .slice(0, -1)
    .flatMap((e) => e.cartoes)
    .filter(TESTE[chip]).length;
}

export function reais(v: number): string {
  return `R$ ${Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function somaEtapa(e: Etapa, cartoes: Cartao[]) {
  const soma = cartoes.reduce((t, k) => t + k.valor, 0);
  return { soma, ponderado: e.probabilidade ? soma * e.probabilidade : undefined };
}

/** Resumo do recorte, como o CabecalhoDoFunil: abertos (sem a última etapa), soma e atrasados. */
export function resumo(etapas: { cartoes: Cartao[] }[]) {
  const abertos = etapas.slice(0, -1).flatMap((e) => e.cartoes);
  return {
    abertos: abertos.length,
    soma: abertos.reduce((t, k) => t + k.valor, 0),
    atrasados: abertos.filter((k) => k.atrasado).length,
  };
}
