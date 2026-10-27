/**
 * Toda a copy e as constantes da LP num lugar só: a página, o JSON-LD, o
 * `llms.txt` e o `sitemap` leem daqui, para que o texto que o visitante lê e o
 * que a IA cita nunca divirjam.
 *
 * Regras do texto: pt-BR, sem número de resultado que não seja verificável,
 * nada de "não é X, é Y", nada de travessão. Cada afirmação sobre o produto
 * sai do README ou do CHANGELOG do CRM. O que a oferta ainda não decidiu fica
 * de fora do texto (bônus, prazos, hospedagem). Compra de saldo e cobrança do
 * excedente de IA só entram quando existirem no produto.
 */

export const SITE = {
  nome: "Verdash CRM",
  url: "https://crm.verdash.com.br",
  descricao:
    "CRM com agentes de inteligência artificial para negócios que vendem pelo WhatsApp e pelo Instagram: conversas, funil e atendimento automático com passagem para uma pessoa, com implantação opcional pela Tektus.",
  /** WhatsApp comercial da Tektus (o mesmo da LP de tráfego da agência). */
  whatsapp: "5521977357727",
  atualizadoEm: "2026-10-25",
} as const;

export function linkWhatsapp(mensagem: string): string {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

/** Garantia só aparece na página quando as condições forem decididas. */
export const GARANTIA_CONFIRMADA = true;

const MENSAGEM_COMPRAR = "Oi, quero assinar o Verdash CRM.";

export const CTA = {
  comprar: {
    rotulo: "Quero o Verdash CRM",
    apoio: "Planos a partir de R$ 157 por mês. A implantação pela Tektus é opcional: R$ 1.297 em até 3x sem juros.",
    mensagem: MENSAGEM_COMPRAR,
    // TODO(checkout): a URL do checkout ainda não existe. Quando existir, entra aqui no lugar do WhatsApp.
    href: linkWhatsapp(MENSAGEM_COMPRAR),
  },
  duvida: {
    rotulo: "Tirar uma dúvida no WhatsApp",
    mensagem: "Oi, vi o Verdash CRM e tenho uma dúvida antes de comprar.",
  },
} as const;

export const NAV = [
  { href: "#plantao", rotulo: "Como funciona" },
  { href: "#agente", rotulo: "O atendente de IA" },
  { href: "#oferta", rotulo: "Preço" },
  { href: "#faq", rotulo: "Perguntas" },
] as const;

const ABERTURA = "Todo cliente que chama no WhatsApp é respondido.";
const DESTAQUE = "Inclusive às 22h de sábado.";

export const HERO = {
  eyebrow: "Verdash CRM. Ninguém fica no vácuo.",
  abertura: ABERTURA,
  destaque: DESTAQUE,
  titulo: `${ABERTURA} ${DESTAQUE}`,
  texto: "O Verdash CRM responde no horário que você definir e junta atendente de IA, funil de vendas e equipe no mesmo lugar, no WhatsApp e no Instagram.",
  preco:
    "Verdash CRM com IA: R$ 397 por mês, com teto de US$ 15 de IA por mês. Verdash CRM sem IA, com a sua própria chave: R$ 157 por mês. Implantação opcional pela Tektus, em pagamento único de R$ 1.297 em até 3x sem juros.",
  precoLinha: "A partir de R$ 157 por mês, com ou sem IA.",
  precoLink: "Ver planos e preços",
} as const;

export const VIDEO = {
  legenda_sem_video: "O vídeo está em produção. Enquanto isso, estas telas mostram o sistema no trabalho.",
} as const;

export const FAIXA_ROTULO = "Conecta onde você já vende";

export const FAIXA_APOIO = "A Tektus orienta se o seu volume pede QR code ou o canal oficial.";

export const FAIXA_PAUSAR = { pausar: "Pausar movimento", retomar: "Retomar movimento" } as const;

/** Duas linhas da faixa. `marca` liga o item ao logotipo em `ui/logos.ts`. */
export const FAIXA_CANAIS = [
  { nome: "WhatsApp por QR code", marca: "whatsapp" },
  { nome: "WhatsApp oficial da Meta", marca: "whatsapp" },
  { nome: "Instagram Direct", marca: "instagram" },
  { nome: "Comentários do Instagram", marca: "instagram" },
] as const;

export const FAIXA_INTEGRACOES = [
  { nome: "Google Agenda", marca: "agenda" },
  { nome: "Google Ads", marca: "ads" },
  { nome: "Meta Ads", marca: "meta" },
  { nome: "OpenRouter", marca: "openrouter" },
  { nome: "Anthropic", marca: "anthropic" },
  { nome: "OpenAI", marca: "ia" },
] as const;

export const PROBLEMAS_TITULO = "O vácuo tem hora, e o seu anúncio paga por ele.";
export const PROBLEMAS_INTRO =
  "O vácuo é o tempo entre a mensagem do cliente e a próxima ação da sua empresa. A equipe trabalha muito. O vácuo cresce nas horas em que ninguém está olhando, e cada conversa que cai nele foi paga duas vezes: no anúncio e no salário de quem não deu conta de responder.";

export const PROBLEMAS = [
  {
    titulo: "O preço chegou às 15h e o cliente sumiu.",
    texto:
      'O cliente pergunta "quanto custa?", recebe a resposta e não volta. Ninguém retoma. Três semanas depois ele fecha com o concorrente que mandou mensagem no dia seguinte.',
    saida: "A conversa parada volta a andar com uma mensagem de retomada pelo nome dele.",
  },
  {
    titulo: "Sábado, 22h, três mensagens do anúncio.",
    texto:
      "O anúncio roda no fim de semana. A recepcionista responde na segunda, às 9h. Duas dessas pessoas já agendaram em outro lugar.",
    saida: "A IA responde no fim de semana, ou avisa quando a equipe volta. Você configura o horário.",
  },
  {
    titulo: '"Vou ver com meu marido e te falo."',
    texto: "A conversa afunda embaixo de 80 outras e ninguém lembra dela. O cliente também esquece.",
    saida: "O sistema lembra por você e a conversa aparece no Radar.",
  },
  {
    titulo: "O melhor vendedor pediu demissão.",
    texto:
      "A carteira estava no celular pessoal dele. Você não sabe o que estava em negociação, com quem, nem a que preço.",
    saida: "O cliente e a conversa ficam na empresa, numa caixa compartilhada.",
  },
  {
    titulo: "400 conversas do anúncio. Quantas compraram?",
    texto:
      "A agência mostra o custo por conversa. Você pergunta quantas viraram venda e ninguém sabe. A Meta também não sabe, e continua trazendo curioso.",
    saida: "Cada etapa do funil volta para a Meta e para o Google Ads. O anúncio aprende com quem comprou.",
  },
  {
    titulo: '"Ninguém me respondeu."',
    texto:
      "O cliente reclama. Você abre o celular da empresa e não descobre quem pegou a conversa, quando pegou nem o que foi dito.",
    saida: "Cada conversa mostra quem pegou, quando e onde parou.",
  },
] as const;

export const PROBLEMAS_FECHO =
  "A causa raramente é preguiça da sua equipe. O WhatsApp nasceu para conversar, e ninguém o configurou para organizar uma operação de vendas.";

/** Estatística externa, a única da página: a fonte vai dita na própria frase. */
export const ESTATISTICA_RD =
  'Segundo o Panorama de Marketing e Vendas 2026 da RD Station, 40% das equipes têm a gestão do WhatsApp fragmentada e 19% usam planilha.';

export const CONTA = {
  titulo: "A conta com os seus números",
  intro: "Duas contas, feitas só com o que você digitar. A página faz a multiplicação e nenhum número aqui é nosso.",
  campo1: "Conversas por mês que chegam do anúncio",
  campo2: "Fatia dessas conversas que ficou sem resposta ou sem retorno (em %)",
  campo3: "Ticket médio de uma venda (em R$)",
  resultado: "O vácuo levou este mês:",
  vazio: "Preencha os três campos para ver a conta.",
  nota: "Este é o valor das vendas que chegaram até a sua porta e ficaram sem atendimento. O Verdash CRM pode recuperar parte desse valor, e a parte depende da sua operação. Se a sua conta der pouco, o Verdash CRM provavelmente não se paga para você. Melhor saber agora.",
  privacidade: "O cálculo roda no seu navegador. Nenhum dado é enviado.",
  ponte: "Se o número doeu, o resto da página mostra como colocar alguém olhando o tempo todo.",
} as const;

export const CALCULADORA = {
  abaVacuo: "Quanto o vácuo custa",
  abaTime: "Time de IA x time de pessoas",
  exemplo: "Usar um exemplo hipotético",
  honesta:
    "A conta usa só os números que você informou. Ela não promete que a IA substitui pessoas: quanto do atendimento cabe à IA e quanto fica com a equipe é decisão sua.",
  time: {
    intro: "Compare o custo mensal do seu time de hoje com um time menor, supervisionando o atendente de IA.",
    atendentes: "Quantos atendentes você tem hoje",
    custo: "Custo mensal de cada atendente, com encargos (em R$)",
    supervisao: "Quantas pessoas ficariam na supervisão da IA",
    plano: "Plano do Verdash CRM",
    comIA: "Com IA, R$ 397 por mês (teto de US$ 15 de IA incluído)",
    semIA: "Sem IA, R$ 157 por mês (a IA entra com a sua chave)",
    custoIA: "O que você paga de IA por mês na sua chave (em R$)",
    vazio: "Preencha os campos para ver a comparação.",
    parcial: "Faltam informações para fechar a conta:",
    erro: "Há campos com valor inválido. Os avisos estão ao lado de cada um.",
    hoje: "O seu time de hoje, por mês",
    depois: "Time menor mais Verdash CRM, por mês",
    economiaMes: "Economia por mês",
    economiaAno: "Economia em 12 meses",
    negativoMes: "Diferença por mês: o Verdash CRM custaria mais",
    negativoAno: "Diferença em 12 meses: o Verdash CRM custaria mais",
    negativoTexto:
      "Com esses números, o time menor mais o Verdash CRM sai mais caro do que o time de hoje. Nesse cenário a conta não fecha, e a implantação opcional também não se paga.",
    meses: "A implantação opcional (R$ 1.297) seria coberta por essa economia em",
    zeroTexto: "Com esses números, o custo mensal é o mesmo nos dois cenários.",
  },
  erros: {
    invalido: "Use só números, com vírgula nos centavos.",
    negativo: "O valor não pode ser negativo.",
    "muito-alto": "O valor passa do limite que a calculadora aceita.",
    fracionado: "Use um número inteiro.",
    supervisaoMaior: "A supervisão não pode passar do número de atendentes de hoje.",
    atendentesZero: "Informe ao menos 1 atendente.",
  },
} as const;

export const MECANISMO = {
  titulo: "O Plantão do Verdash: alguém olhando o tempo todo",
  texto:
    "O Verdash CRM junta numa tela só o que hoje mora separado: a conversa, o funil e o atendente de IA. A IA fica na frente e responde. O funil dá a cada pessoa um dono e uma etapa. O Radar mostra o que está esfriando antes de morrer. Quando a conversa pede uma pessoa, a sua equipe assume com o histórico na mão.",
  pecas: [
    {
      titulo: "A IA na frente",
      texto: "Atende e qualifica no horário que você definir, com a base de conhecimento do seu negócio.",
    },
    { titulo: "O funil como memória", texto: "Cada conversa tem etapa e responsável." },
    { titulo: "O Radar atrás", texto: "Aponta a conversa parada e propõe a retomada." },
  ],
  fecho: "Ninguém fica no vácuo.",
} as const;

export const ETAPAS = [
  {
    titulo: "A pessoa chama",
    texto:
      "Pelo WhatsApp (QR code ou canal oficial da Meta) ou pelo Instagram. A conversa cai numa caixa só, onde a sua equipe e a IA trabalham lado a lado.",
  },
  {
    titulo: "O atendente de IA responde",
    texto:
      "Responde com o catálogo, os preços e as regras que a sua empresa cadastrou, pergunta o que falta e leva o negócio para a etapa certa do funil enquanto a conversa avança.",
  },
  {
    titulo: "O funil mostra onde cada negócio está",
    texto:
      "Um quadro com as etapas do seu jeito. Em uma olhada você vê quantos negócios estão parados e em qual etapa.",
  },
  {
    titulo: "Uma pessoa assume quando faz diferença",
    texto: "A conversa passa para um atendente com o histórico completo, e fica registrado quem assumiu e quando.",
  },
  {
    titulo: "A conversa que esfria volta a andar",
    texto:
      "O follow-up retoma a conversa parada, com tempo adaptativo e gatilhos por etapa. O Radar lista o que corre risco de morrer sem resposta.",
  },
] as const;

export const PROVA = {
  titulo: "O sistema por dentro",
  intro: "Telas do Verdash CRM. Cada uma responde a uma cena da seção anterior.",
  inbox: {
    titulo: "A caixa onde a equipe e a IA se encontram",
    texto:
      "WhatsApp e Instagram na mesma caixa. Cada conversa mostra quem está com ela. A resposta da IA fica no balão, igual à de uma pessoa.",
  },
  funil: {
    titulo: "Cada negócio com etapa e dono",
    texto:
      "O funil usa as palavras do seu negócio. A clínica fala em Paciente e Agendado, a loja em Comprador e Pago.",
  },
} as const;

export const RADAR = {
  titulo: "Conversa que esfria aparece antes de morrer.",
  texto:
    "O Radar lista as conversas sem resposta, há quanto tempo estão paradas e qual é a próxima ação. O follow-up propõe a mensagem de retomada, respeita a janela de horário do canal e usa tempo adaptativo com gatilhos por etapa.",
} as const;

export const AGENTE = {
  titulo: "Um atendente de IA com rédea curta, que você vê trabalhar.",
  texto:
    'O agente de IA do Verdash CRM trabalha dentro do funil: lê a conversa, consulta o que a sua empresa cadastrou e executa tarefas. Sem menu de "digite 1". Cada cena abaixo existe no produto.',
  itens: [
    {
      rotulo: 'Quarta, 23h: "quanto custa?"',
      texto:
        "Responde com o preço e o catálogo que estão na base de conhecimento do agente, o MEP do seu negócio que a Tektus cria. Antes de cada envio, uma verificação barra promessa que não existe nessa base.",
    },
    {
      rotulo: "Cliente manda um áudio",
      texto: "O sistema transcreve o áudio no balão e o agente responde com base no que foi dito.",
    },
    {
      rotulo: '"Tem horário na quinta?"',
      texto:
        "O agente consulta o Google Agenda, vê a ocupação e cria o agendamento. Se a pessoa pedir para mudar ou cancelar, ele altera ou cancela.",
    },
    {
      rotulo: "O cliente pede para falar com gente",
      texto: "A IA passa a conversa para um atendente com o histórico inteiro. Fica registrado quem assumiu e quando.",
    },
    {
      rotulo: "Fora do horário",
      texto: "Você escolhe se a IA responde sozinha ou se o sistema manda um aviso configurado até a equipe voltar.",
    },
    {
      rotulo: "A IA aprende, com a sua aprovação",
      texto:
        "O agente sugere melhorias para si mesmo. Nada muda no atendimento sem uma pessoa aprovar a versão nova. Você vê o que ele respondeu e quando chamou alguém.",
    },
  ],
} as const;

export const CANAIS = {
  titulo: "Os canais em que o seu cliente já chama.",
  texto:
    "WhatsApp e Instagram chegam na mesma caixa, com a sua equipe e a IA lado a lado. No WhatsApp você escolhe entre QR code, com ritmo de envio e janela de horário, e o canal oficial da Meta, com modelos de mensagem aprovados. A Tektus orienta qual cabe no seu volume.",
} as const;

export const NICHOS = {
  titulo: "O funil com as palavras do seu negócio.",
  texto:
    "Você nomeia o funil. A pessoa que chama vira Paciente, Cliente ou Comprador, e o negócio ganho vira Agendado, Fechado ou Pago. Serve a clínicas, imobiliárias, infoprodutos, agências, lojas e prestadores de serviço: tudo que vende pelo WhatsApp e pelo Instagram.",
  exemplos: [
    { negocio: "Clínica", lead: "Paciente", ganho: "Agendado" },
    { negocio: "Infoproduto", lead: "Comprador", ganho: "Pago" },
    { negocio: "Serviços", lead: "Cliente", ganho: "Fechado" },
  ],
} as const;

export const IMPLANTACAO = {
  titulo: "Implantação opcional: a Tektus entrega funcionando.",
  texto:
    "A implantação é um serviço opcional. Se você contratar, a Tektus conduz tudo e acompanha os primeiros 30 dias de uso. Você entrega o material do seu negócio (catálogo, preços, regras, horários) e participa do treinamento. Sua equipe continua no WhatsApp, numa caixa só.",
  passos: [
    { titulo: "Diagnóstico", texto: "Como o seu comercial funciona hoje e onde a venda se perde." },
    {
      titulo: "Funil e WhatsApp no ar",
      texto: "A Tektus monta o funil com as etapas do seu jeito, define responsáveis e conecta o WhatsApp.",
    },
    {
      titulo: "Atendente de IA treinado no seu negócio",
      texto:
        "A Tektus cria um MEP (Manual Estratégico de Posicionamento) específico do seu negócio, a partir das informações que você entrega. Esse MEP vira a base de conhecimento do agente de IA no CRM.",
    },
    {
      titulo: "Treinamento da equipe e go-live",
      texto: "A equipe aprende a operar e o atendimento entra no ar.",
    },
    {
      titulo: "30 dias de acompanhamento",
      texto: "Ajustes no agente e no funil com base no uso real.",
    },
  ],
  /** Só a ordem dos passos e o prazo geral são afirmados; não há prazo por etapa. */
  prazoGeral: "30 dias" as string,
  rotuloPrazo: "Prazo geral de implementação",
  /** Ícone e texto curto de cada passo da linha do tempo, na mesma ordem de `passos`. */
  linha: [
    { icone: "busca", titulo: "Diagnóstico", texto: "Como o seu comercial funciona hoje e onde a venda se perde." },
    { icone: "funil", titulo: "Funil e WhatsApp no ar", texto: "Etapas do seu jeito, responsáveis definidos e o WhatsApp conectado." },
    { icone: "cerebro", titulo: "Agente de IA treinado", texto: "A Tektus cria o MEP do seu negócio e ele vira a base do agente." },
    { icone: "usuario", titulo: "Treinamento e go-live", texto: "A equipe aprende a operar e o atendimento entra no ar." },
    { icone: "calendario", titulo: "30 dias de acompanhamento", texto: "Ajustes no agente e no funil com base no uso real." },
  ],
  acompanhamento: "Acompanhamento de 30 dias após o go-live",
  tektusFazTitulo: "A Tektus faz",
  tektusFaz: [
    "Diagnóstico do comercial",
    "Funil com etapas e responsáveis",
    "Conexão do WhatsApp e do Instagram",
    "MEP do seu negócio, base do agente",
    "Treinamento da equipe",
    "30 dias de ajustes no agente e no funil",
  ],
  voceEntregaTitulo: "Você entrega",
  voceEntrega: [
    "Catálogo e preços",
    "Regras de atendimento e horários",
    "Acesso aos números e contas",
    "Presença no treinamento da equipe",
  ],
  entregaveisTitulo: "O que fica pronto",
  entregaveis: [
    { icone: "funil", texto: "Funil configurado" },
    { icone: "cerebro", texto: "Agente com a base do MEP" },
    { icone: "chat", texto: "Canais conectados" },
    { icone: "usuario", texto: "Equipe treinada" },
    { icone: "calendario", texto: "Plano de ajustes dos 30 dias" },
  ],
  cta: "Ver o preço da implantação",
} as const;

export const OFERTA = {
  nome: "Verdash CRM",
  titulo: "Quanto custa o Verdash CRM, com e sem IA",
  itens: [
    {
      titulo: "Funil sob medida",
      texto: "O quadro de vendas com as etapas do seu negócio, os responsáveis e os motivos de perda.",
    },
    {
      titulo: "WhatsApp e Instagram numa caixa só",
      texto: "Conectados do jeito certo para o seu volume, com a equipe e a IA lado a lado.",
    },
    {
      titulo: "Atendente de IA treinado no seu negócio",
      texto:
        "Com a implantação opcional, a Tektus cria um MEP (Manual Estratégico de Posicionamento) específico do seu negócio, e ele vira a base de conhecimento do agente. O agente passa para a sua equipe com o histórico, entende áudio e cria agendamento. No plano sem IA, você usa a sua própria chave de IA.",
    },
    {
      titulo: "Follow-up e Radar ligados",
      texto: "Retomada da conversa parada e a lista do que está esfriando.",
    },
    {
      titulo: "Treinamento da equipe",
      texto: "Na implantação opcional, para a sua equipe usar desde o primeiro dia.",
    },
    {
      titulo: "30 dias de acompanhamento",
      texto: "Na implantação opcional, com ajuste do agente e do funil conforme a operação real mostrar.",
    },
  ],
  precoTitulo: "Quanto custa",
  planos: [
    {
      nome: "Verdash CRM com IA",
      preco: "R$ 397",
      periodo: "por mês",
      destaque: true,
      botao: "Assinar o plano com IA",
      mensagem: "Oi, quero assinar o Verdash CRM com IA (R$ 397 por mês).",
      detalhes: [
        "Atendimento por IA incluído, com teto de US$ 15 de IA por mês. Ao chegar no teto, a IA pausa.",
        "Até 3 números de WhatsApp e até 2 contas de Instagram.",
        "Sem cobrança por usuário.",
      ],
    },
    {
      nome: "Verdash CRM sem IA",
      preco: "R$ 157",
      periodo: "por mês",
      destaque: false,
      botao: "Assinar o plano sem IA",
      mensagem: "Oi, quero assinar o Verdash CRM sem IA (R$ 157 por mês).",
      detalhes: [
        "Você usa a sua própria chave de IA.",
        "Caixa de entrada, funil, follow-up e Radar.",
        "Até 3 números de WhatsApp e até 2 contas de Instagram.",
        "Sem cobrança por usuário.",
      ],
    },
  ],
  implantacao: {
    rotulo: "Implantação opcional, pagamento único",
    preco: "R$ 1.297",
    parcelas: "em até 3x sem juros no cartão, ou R$ 1.245,32 no Pix",
    detalhe: "Inclui diagnóstico, configuração, agente de IA, treinamento e 30 dias de acompanhamento.",
    aviso: "Ela é opcional. Pode ser contratada junto com o plano, e a Tektus oferece de novo durante a assinatura.",
  },
  periodoRotulo: "Período de cobrança",
  mensal: "Mensal",
  anual: "Anual",
  porMes: "por mês",
  semFidelidade: "Sem fidelidade no plano mensal, cancele quando quiser.",
  anualDescricao: "Preço do plano anual com 15% de desconto, pago de uma vez",
  equivalente: "por mês, equivalente",
  porAno: "por ano",
  recomendado: "Recomendado",
  /** Comparativo item a item; cada linha tem o texto de cada plano e o estado (incluso ou com a sua chave). */
  comparativo: [
    {
      comIA: { estado: "incluso", texto: "Caixa de entrada de WhatsApp e Instagram" },
      semIA: { estado: "incluso", texto: "Caixa de entrada de WhatsApp e Instagram" },
    },
    {
      comIA: { estado: "incluso", texto: "Funil, follow-up e Radar" },
      semIA: { estado: "incluso", texto: "Funil, follow-up e Radar" },
    },
    {
      comIA: { estado: "incluso", texto: "Atendente de IA incluído, com teto de US$ 15 de IA por mês. Ao chegar no teto, a IA pausa." },
      semIA: { estado: "chave", texto: "Atendente de IA com a sua própria chave" },
    },
    {
      comIA: { estado: "incluso", texto: "Até 3 números de WhatsApp e até 2 contas de Instagram" },
      semIA: { estado: "incluso", texto: "Até 3 números de WhatsApp e até 2 contas de Instagram" },
    },
    {
      comIA: { estado: "incluso", texto: "Sem cobrança por usuário" },
      semIA: { estado: "incluso", texto: "Sem cobrança por usuário" },
    },
  ],
  implantacaoSeletor: "Adicionar implantação",
  implantacaoDescricao: "Diagnóstico, funil e WhatsApp, agente treinado com o MEP, treinamento e 30 dias de acompanhamento.",
  totalMensal: "Do 1º ao 3º mês, aprox.",
  planoMaisParcela: "plano mais a parcela da implantação em até 3x sem juros",
  descComIA: "A IA já vem incluída, com teto de US$ 15 por mês.",
  descSemIA: "Você conecta a sua própria chave de IA.",
  totalDepois: "Depois",
  maisSuaIA: "mais a sua IA",
  parcelasAnual: "Implantação cobrada à parte, em até 3x sem juros.",
  /** Só a garantia fica aqui: "sem cobrança por usuário" está no comparativo e a dúvida tem o botão logo abaixo. */
  confianca: [{ icone: "escudo", texto: "Garantia de 100% da implantação", exigeGarantia: true }],
} as const;

/** Bloco só renderiza com `GARANTIA_CONFIRMADA` true. */
export const GARANTIA = {
  titulo: "Garantia de implantação",
  texto:
    "A Tektus devolve 100% da implantação, para quem a contratou, se não entregar o que foi combinado por escrito.",
  marcosTitulo: "O que fica combinado por escrito",
  marcos: [
    { icone: "agente", texto: "Agentes" },
    { icone: "funil", texto: "Funis e pipelines" },
    { icone: "bandeira", texto: "Campanhas" },
    { icone: "trocar", texto: "Follow-ups" },
    { icone: "conexao", texto: "Fluxos de atendimento" },
  ],
  limite:
    "A garantia cobre o valor da implantação, e só vale para quem a contratou. Ela deixa o número de vendas de fora, porque o resultado depende do seu volume de conversas, do seu ticket e do seu mercado.",
} as const;

export const PARA_QUEM = {
  titulo: "Para quem o Verdash CRM serve, e para quem não",
  serve: {
    titulo: "Serve para",
    texto:
      "Dono ou gestor de negócio que vende pelo WhatsApp e pelo Instagram, recebe volume de conversas (de anúncio ou orgânico) e tem entre 1 e 15 pessoas atendendo. Clínica, imobiliária, infoproduto, loja, agência, prestador de serviço.",
  },
  naoServe: {
    titulo: "Fica de fora",
    texto:
      "Quem recebe poucas conversas por mês e vende um ticket baixo. Nesse caso, a conta do vácuo pode não fechar com a mensalidade, e o melhor é comprar mais tarde. Quem quer só um chatbot de menu de opções também dispensa o Verdash CRM.",
  },
} as const;

export const OBJECOES = [
  {
    p: '"O robô vai falar besteira com meu cliente."',
    r: "Ele responde com o catálogo, o preço e as regras que a sua empresa cadastrou. Uma verificação barra promessa que não existe no cadastro antes do envio. O que ele respondeu fica na conversa.",
  },
  {
    p: '"Meu cliente quer falar com gente."',
    r: 'Fala com gente sempre que quiser. A IA tira da frente o "quanto custa" e o "tem horário". A pessoa entra quando faz diferença, e fica registrado quem assumiu.',
  },
  {
    p: '"Minha equipe vai se recusar a usar."',
    r: "A equipe continua no WhatsApp, numa caixa só, com a IA ao lado. O funil se move pela conversa. Ninguém preenche planilha.",
  },
  {
    p: '"Implantar CRM dá trabalho."',
    r: "Você não instala nada. Se contratar a implantação opcional, a Tektus configura o funil e o WhatsApp, ensina o agente sobre o seu negócio, treina a equipe e acompanha os primeiros 30 dias.",
  },
  {
    p: '"Vai banir meu número."',
    r: "Há dois caminhos: QR code, com ritmo e janela de envio, ou o canal oficial da Meta, com modelos aprovados. A Tektus orienta qual cabe no seu volume. Nenhum canal garante imunidade a bloqueio.",
  },
  {
    p: '"Já tentei CRM e abandonei."',
    r: "Aqui o funil e a conversa moram no mesmo lugar, então o funil se move pelas próprias conversas. O Radar aponta o que está parado.",
  },
] as const;

export const FAQ = [
  {
    p: "O que é o Verdash CRM?",
    r: "O Verdash CRM é um CRM para negócios que vendem pelo WhatsApp e pelo Instagram. Reúne as conversas, o funil de vendas e agentes de inteligência artificial que atendem e qualificam quem chama, e passam a conversa para uma pessoa quando é preciso. A Tektus oferece a implantação como serviço opcional, com 30 dias de acompanhamento.",
  },
  {
    p: "Quanto custa o Verdash CRM?",
    r: "O plano com IA custa R$ 397 por mês e inclui um teto de US$ 15 de IA por mês. O plano sem IA custa R$ 157 por mês, e a empresa usa a própria chave de IA. Os dois incluem até 3 números de WhatsApp, até 2 contas de Instagram e usuários sem cobrança. A implantação opcional custa R$ 1.297 em até 3x sem juros no cartão, ou R$ 1.245,32 no Pix.",
  },
  {
    p: "O que está incluso na mensalidade e na implantação?",
    r: "A mensalidade dá acesso ao sistema, com caixa de entrada compartilhada, funil, follow-up e Radar, e o atendente de IA no plano com IA. A implantação é opcional e paga uma vez. Inclui diagnóstico, configuração do funil e do WhatsApp, treinamento do agente, treinamento da equipe e 30 dias de acompanhamento.",
  },
  {
    p: "A IA do Verdash CRM atende sozinha? Quando ela passa para uma pessoa?",
    r: "O agente atende e qualifica sozinho dentro das regras que a empresa define. Quando a conversa pede uma pessoa, ele passa o atendimento a um atendente com o histórico completo. A passagem fica registrada com quem assumiu e quando, e o cliente pode pedir uma pessoa a qualquer momento.",
  },
  {
    p: "Como a IA do Verdash CRM aprende o meu negócio?",
    r: "A Tektus cria um MEP (Manual Estratégico de Posicionamento) específico do seu negócio, a partir das informações que a empresa entrega: catálogo, preços, regras e horários. Esse MEP vira a base de conhecimento do agente de IA no CRM, e o agente responde a partir dela.",
  },
  {
    p: "A IA pode prometer desconto ou prazo que a minha empresa não tem?",
    r: "O agente responde com o que a empresa cadastrou: catálogo, preços e regras. Antes de cada envio, uma verificação barra promessa que não existe no cadastro. As respostas e as execuções do agente ficam registradas, então o dono confere o que foi dito e quando o agente chamou uma pessoa.",
  },
  {
    p: "A IA responde no fim de semana e à noite?",
    r: "O agente do Verdash CRM responde no fim de semana e à noite, ou apenas no horário de funcionamento que a empresa definir. Fora desse horário, o sistema pode mandar um aviso configurável até a equipe voltar. A janela de resposta é ajustada por número de WhatsApp.",
  },
  {
    p: "O Verdash CRM funciona com o WhatsApp oficial da Meta ou só por QR code?",
    r: "Funciona dos dois jeitos. Por QR code, com proteções contra bloqueio de número, como ritmo de envio e janela de horário, ou pelo canal oficial da Meta, com os modelos de mensagem aprovados e sincronizados. O custo do canal oficial fica por conta do cliente. A Tektus orienta qual cabe no volume da empresa.",
  },
  {
    p: "O Verdash CRM atende conversas do Instagram?",
    r: "O Verdash CRM atende o Instagram. As mensagens chegam na mesma caixa de entrada do WhatsApp, com a equipe e a IA trabalhando lado a lado. Os dois planos incluem até 2 contas de Instagram e até 3 números de WhatsApp, sem cobrança por usuário.",
  },
  {
    p: "Minha equipe vai conseguir usar?",
    r: "A equipe continua atendendo pelo WhatsApp, numa caixa só, com a IA ao lado. O funil se move pela conversa e ninguém preenche planilha. Quem contrata a implantação opcional recebe o treinamento da equipe e 30 dias de acompanhamento da Tektus para ajustar o que a operação real mostrar.",
  },
  {
    p: "Quanto tempo leva a implantação do Verdash CRM?",
    r: "O prazo geral da implantação opcional é de 30 dias, do diagnóstico até o atendimento entrar no ar. Depois disso a Tektus acompanha os primeiros 30 dias de uso, ajustando o agente de IA e o funil com o que a operação real mostrar. A implantação é paga uma vez e pode ser contratada junto com o plano.",
  },
  {
    p: "Como funciona o plano anual do Verdash CRM?",
    r: "O plano anual tem 15% de desconto sobre o valor mensal e é cobrado de uma vez. O plano com IA sai por R$ 4.049,40 por ano e o plano sem IA por R$ 1.601,40 por ano. O plano mensal não tem fidelidade e pode ser cancelado quando você quiser. A implantação opcional é cobrada à parte, em até 3x sem juros no cartão ou R$ 1.245,32 no Pix.",
  },
  {
    p: "O que a Tektus faz na implantação do Verdash CRM?",
    r: "A implantação é opcional. Quem a contrata tem a Tektus conduzindo estas etapas: diagnóstico, configuração do funil e do WhatsApp, treinamento do agente de IA com o conhecimento do negócio, treinamento da equipe e entrada no ar, seguidos de 30 dias de acompanhamento. A empresa entrega o catálogo, os preços, as regras e os horários.",
  },
  {
    p: "Para qual tipo de negócio o Verdash CRM serve?",
    r: "Serve a quem vende pelo WhatsApp e pelo Instagram e recebe volume de conversas: clínicas, imobiliárias, infoprodutos, agências, lojas e prestadores de serviço, com equipe de 1 a 15 pessoas. Quem recebe poucas conversas por mês e vende ticket baixo pode não recuperar a mensalidade.",
  },
  {
    p: "Já usei CRM e abandonei. O que muda com o Verdash CRM?",
    r: "No Verdash CRM o funil e a conversa moram no mesmo lugar, então o funil se move pelas próprias conversas, sem alimentação manual. O Radar mostra as conversas paradas, a IA faz o primeiro atendimento e quem contrata a implantação opcional conta com 30 dias de acompanhamento da Tektus para o sistema entrar na rotina da equipe.",
  },
  {
    p: "Os dados da minha empresa e dos meus clientes ficam seguros?",
    r: "Os dados de cada empresa ficam isolados dos de outras, com teste de isolamento a cada alteração do sistema. Há quatro papéis de acesso e verificação em duas etapas exigível por papel. Ações sensíveis ficam num registro de auditoria, e há exportação e anonimização de dados de contato como apoio à LGPD.",
  },
  {
    p: "Qual inteligência artificial o Verdash CRM usa e quem controla o gasto?",
    r: "O sistema funciona com OpenRouter, Anthropic ou OpenAI, e o provedor se troca pela tela. No plano com IA, o consumo entra num teto de US$ 15 por mês, e ao chegar nele a IA pausa. No plano sem IA, a empresa cadastra a própria chave. A tela de uso mostra o consumo.",
  },
  {
    p: "Como o Verdash CRM usa o Google Agenda e o Google Ads?",
    r: "Quando a empresa conecta o Google Agenda, o Verdash CRM mostra a ocupação da agenda e cria, altera e cancela os agendamentos pedidos pela própria pessoa. Quando conecta o Google Ads, devolve ao anúncio as vendas que ele trouxe. O uso dos dados do Google segue a Política de Privacidade.",
  },
  {
    p: "Já sou cliente. Como entro?",
    r: "Pelo botão Entrar no topo da página, ou direto em crm.verdash.com.br/login. Quem já está com o sistema aberto neste navegador e digita o endereço do site vai direto para o sistema, sem passar pela página inicial. Se esqueceu a senha, a opção de recuperação fica na tela de entrada.",
  },
] as const;

export const GOOGLE = {
  titulo: "Integração com o Google",
  texto:
    "Quando a empresa conecta o Google Agenda, o Verdash CRM mostra a ocupação da agenda e cria, altera e cancela os agendamentos pedidos pela própria pessoa. Quando conecta o Google Ads, devolve ao anúncio as vendas que ele trouxe. O uso dos dados do Google está descrito na",
} as const;

export const CTA_FINAL = {
  titulo: "Hoje à noite, quem responde as suas conversas?",
  texto:
    "Por R$ 157 por mês, ou R$ 397 com a IA incluída, o Verdash CRM atende o seu WhatsApp e o seu Instagram. Se quiser, a Tektus faz a implantação por R$ 1.297 em até 3x sem juros, treina a sua equipe e acompanha os primeiros 30 dias.",
  assinatura: "Ninguém fica no vácuo.",
} as const;

export const META_DESCRICAO =
  "CRM de WhatsApp e Instagram com atendente de IA. Planos de R$ 157 e R$ 397 por mês, com implantação opcional pela Tektus por R$ 1.297 em até 3x sem juros.";

/** Página para onde a Stripe leva quem acabou de pagar. Sem prazo prometido: o convite chega quando a conta é criada. */
export const OBRIGADO = {
  titulo: "Obrigado por assinar",
  texto: "Se o pagamento foi aprovado, o recibo chega no e-mail que você informou.",
  passosTitulo: "O que acontece agora",
  passos: [
    "A Tektus cria a conta da sua empresa com os dados do pagamento.",
    "O convite de acesso chega nesse mesmo e-mail.",
    "Você entra, conecta o WhatsApp e o Instagram e começa a atender.",
  ],
  semConvite: "Se o convite não chegar, olhe a caixa de spam ou chame a Tektus no WhatsApp.",
  botao: "Falar com a Tektus no WhatsApp",
  mensagem: "Oi, acabei de assinar o Verdash CRM e ainda não recebi o convite de acesso.",
} as const;
