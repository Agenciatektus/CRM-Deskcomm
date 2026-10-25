/**
 * Toda a copy e as constantes da LP num lugar só: a página, o JSON-LD, o
 * `llms.txt` e o `sitemap` leem daqui, para que o texto que o visitante lê e o
 * que a IA cita nunca divirjam.
 *
 * Regras do texto: pt-BR, sem número de resultado que não seja verificável,
 * nada de "não é X, é Y", nada de travessão. Cada afirmação sobre o produto
 * sai do README ou do CHANGELOG do CRM. O que a oferta ainda não decidiu fica
 * de fora do texto (garantia, bônus, prazos, custo do canal oficial da Meta,
 * limite de canais no plano sem IA, hospedagem): ver docs/growth/lp-copy-vsl.md.
 */

export const SITE = {
  nome: "Verdash CRM",
  url: "https://crm.verdash.com.br",
  descricao:
    "CRM com agentes de inteligência artificial para negócios que vendem pelo WhatsApp e pelo Instagram: conversas, funil e atendimento automático com passagem para uma pessoa, implantado e acompanhado pela Tektus.",
  /** WhatsApp comercial da Tektus (o mesmo da LP de tráfego da agência). */
  whatsapp: "5521977357727",
  atualizadoEm: "2026-10-25",
} as const;

export function linkWhatsapp(mensagem: string): string {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

/** Garantia só aparece na página quando as condições forem decididas. */
export const GARANTIA_CONFIRMADA = true;

const MENSAGEM_COMPRAR = "Oi, quero o Verdash CRM implantado.";

export const CTA = {
  comprar: {
    rotulo: "Quero o Verdash CRM implantado",
    apoio: "R$ 1.297 de implantação em até 3x sem juros. Depois, R$ 157 ou R$ 397 por mês, conforme o plano.",
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

const ABERTURA = "Sábado, 22h. Três pessoas querem comprar de você.";
const DESTAQUE = "Quem responde?";

export const HERO = {
  eyebrow: "Verdash CRM. Ninguém fica no vácuo.",
  abertura: ABERTURA,
  destaque: DESTAQUE,
  titulo: `${ABERTURA} ${DESTAQUE}`,
  texto:
    "O Verdash CRM coloca um atendente de IA no seu WhatsApp e no seu Instagram, no horário que você definir, e passa a conversa para a sua equipe com o histórico inteiro. Cada pessoa que chama tem dono, resposta e próximo passo. A Tektus implanta tudo e acompanha os primeiros 30 dias.",
  preco:
    "Verdash CRM com IA: R$ 397 por mês, com teto de US$ 15 de IA por mês. Verdash CRM sem IA, com a sua própria chave: R$ 157 por mês. Implantação única de R$ 1.297 em até 3x sem juros.",
  nota: "Dúvida antes de pagar? Um humano da Tektus responde no WhatsApp.",
} as const;

export const VIDEO = {
  legenda_sem_video: "O vídeo está em produção. Enquanto isso, estas telas mostram o sistema no trabalho.",
} as const;

export const FAIXA_ROTULO = "Conecta onde você já vende";

export const FAIXA = [
  "WhatsApp por QR code",
  "WhatsApp oficial da Meta",
  "Instagram",
  "Google Agenda",
  "Google Ads",
  "Funil por nicho",
  "Radar de conversas",
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
  "A causa está fora da preguiça da sua equipe. O WhatsApp nasceu para conversar, e ninguém o configurou para organizar uma operação de vendas.";

/** Estatística externa, a única da página: a fonte vai dita na própria frase. */
export const ESTATISTICA_RD =
  'Segundo o Panorama de Marketing e Vendas 2026 da RD Station, 40% das equipes controlam o WhatsApp "cada vendedor do seu jeito" e 19% usam planilha. Só 28% usam o WhatsApp integrado a um CRM.';

export const CONTA = {
  titulo: "A conta do vácuo, com os seus números",
  intro: "Três números que você já sabe de cabeça. A página faz a multiplicação. Nenhum número aqui é nosso.",
  campo1: "Conversas por mês que chegam do anúncio",
  campo2: "Fatia dessas conversas que ficou sem resposta ou sem retorno (em %)",
  campo3: "Ticket médio de uma venda (em R$)",
  resultado: "O vácuo levou este mês:",
  vazio: "Preencha os três campos para ver a conta.",
  nota: "Este é o valor das vendas que chegaram até a sua porta e ficaram sem atendimento. O número promete só a conta, e deixa de fora quanto o Verdash CRM recupera. Se a sua conta der pouco, o Verdash CRM provavelmente não se paga para você. Melhor saber agora.",
  privacidade: "O cálculo roda no seu navegador. Nenhum dado é enviado.",
  ponte: "Se o número doeu, o resto da página mostra como colocar alguém olhando o tempo todo.",
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
  intro: "Telas do Verdash CRM com dados de exemplo. Cada uma responde a uma cena da seção anterior.",
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
  titulo: "Você não instala nada. A Tektus entrega funcionando.",
  texto:
    "A Tektus conduz a implantação e acompanha os primeiros 30 dias de uso. Você entrega o material do seu negócio (catálogo, preços, regras, horários) e participa do treinamento. Sua equipe continua no WhatsApp, numa caixa só.",
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
} as const;

export const OFERTA = {
  nome: "Verdash CRM Implantado",
  titulo: "Tudo isto, funcionando no seu WhatsApp e no seu Instagram",
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
        "A Tektus cria um MEP (Manual Estratégico de Posicionamento) específico do seu negócio, a partir das informações que você entrega, e ele vira a base de conhecimento do agente. O agente passa para a sua equipe com o histórico, entende áudio e cria agendamento.",
    },
    {
      titulo: "Follow-up e Radar ligados",
      texto: "Retomada da conversa parada e a lista do que está esfriando.",
    },
    {
      titulo: "Treinamento da equipe",
      texto: "Para a sua equipe usar desde o primeiro dia.",
    },
    {
      titulo: "30 dias de acompanhamento",
      texto: "Ajuste do agente e do funil com o que a operação real mostrar.",
    },
  ],
  precoTitulo: "Quanto custa",
  planos: [
    {
      nome: "Verdash CRM com IA",
      preco: "R$ 397",
      periodo: "por mês",
      destaque: true,
      detalhes: [
        "Atendimento por IA incluído, com teto de US$ 15 de IA por mês. Para passar do teto, você adiciona saldo no Verdash CRM ou habilita a cobrança automática do uso excedente.",
        "Até 3 números de WhatsApp e até 2 contas de Instagram.",
        "Sem cobrança por usuário.",
      ],
    },
    {
      nome: "Verdash CRM sem IA",
      preco: "R$ 157",
      periodo: "por mês",
      destaque: false,
      detalhes: [
        "Você usa a sua própria chave de IA.",
        "Caixa de entrada, funil, follow-up e Radar.",
        "Até 3 números de WhatsApp e até 2 contas de Instagram.",
        "Sem cobrança por usuário.",
      ],
    },
  ],
  implantacao: {
    rotulo: "Implantação, pagamento único",
    preco: "R$ 1.297",
    parcelas: "em até 3x sem juros",
    detalhe: "Inclui diagnóstico, configuração, agente de IA, treinamento e 30 dias de acompanhamento.",
  },
  apoioCta: "Dúvida antes de pagar? A Tektus responde no WhatsApp.",
} as const;

/** Bloco só renderiza com `GARANTIA_CONFIRMADA` true. */
export const GARANTIA = {
  titulo: "Garantia de implantação",
  texto:
    "A Tektus devolve 100% da implantação se não entregar o que foi combinado: os agentes, os funis, as campanhas, os follow-ups e os fluxos de atendimento.",
  limite:
    "A garantia cobre o valor da implantação. Ela deixa o número de vendas de fora, porque o resultado depende do seu volume de conversas, do seu ticket e do seu mercado.",
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
    r: "Você não instala nada. A Tektus configura o funil e o WhatsApp, ensina o agente sobre o seu negócio, treina a equipe e acompanha os primeiros 30 dias.",
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
    r: "O Verdash CRM é um CRM para negócios que vendem pelo WhatsApp e pelo Instagram. Reúne as conversas, o funil de vendas e agentes de inteligência artificial que atendem e qualificam quem chama, e passam a conversa para uma pessoa quando é preciso. A Tektus faz a implantação e acompanha os primeiros 30 dias.",
  },
  {
    p: "Quanto custa o Verdash CRM?",
    r: "O Verdash CRM tem dois planos. O plano com IA custa R$ 397 por mês e inclui um teto de US$ 15 de IA por mês. O plano sem IA custa R$ 157 por mês, e a empresa usa a própria chave de IA. Os dois têm até 3 números de WhatsApp e até 2 contas de Instagram, sem cobrança por usuário. A implantação custa R$ 1.297 em até 3x sem juros.",
  },
  {
    p: "O que está incluso na mensalidade e na implantação?",
    r: "A mensalidade dá acesso ao sistema, com caixa de entrada compartilhada, funil, atendente de IA, follow-up e Radar. A implantação, paga uma vez, inclui diagnóstico, configuração do funil e do WhatsApp, treinamento do agente com o seu negócio, treinamento da equipe e 30 dias de acompanhamento.",
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
    r: "A equipe continua atendendo pelo WhatsApp, numa caixa só, com a IA ao lado. O funil se move pela conversa e ninguém preenche planilha. O treinamento da equipe faz parte da implantação, e a Tektus acompanha os primeiros 30 dias para ajustar o que a operação real mostrar.",
  },
  {
    p: "O que a Tektus faz na implantação do Verdash CRM?",
    r: "A Tektus conduz a implantação em etapas: diagnóstico, configuração do funil e do WhatsApp, treinamento do agente de IA com o conhecimento do negócio, treinamento da equipe e entrada no ar, seguidos de 30 dias de acompanhamento. A empresa entrega o catálogo, os preços, as regras e os horários.",
  },
  {
    p: "Para qual tipo de negócio o Verdash CRM serve?",
    r: "Serve a quem vende pelo WhatsApp e pelo Instagram e recebe volume de conversas: clínicas, imobiliárias, infoprodutos, agências, lojas e prestadores de serviço, com equipe de 1 a 15 pessoas. Quem recebe poucas conversas por mês e vende ticket baixo pode não recuperar a mensalidade.",
  },
  {
    p: "Já usei CRM e abandonei. O que muda com o Verdash CRM?",
    r: "No Verdash CRM o funil e a conversa moram no mesmo lugar, então o funil se move pelas próprias conversas, sem alimentação manual. O Radar mostra as conversas paradas, a IA faz o primeiro atendimento e a Tektus acompanha os primeiros 30 dias para o sistema entrar na rotina da equipe.",
  },
  {
    p: "Os dados da minha empresa e dos meus clientes ficam seguros?",
    r: "Os dados de cada empresa ficam isolados dos de outras, com teste de isolamento a cada alteração do sistema. Há quatro papéis de acesso e verificação em duas etapas exigível por papel. Ações sensíveis ficam num registro de auditoria, e há exportação e anonimização de dados de contato como apoio à LGPD.",
  },
  {
    p: "Qual inteligência artificial o Verdash CRM usa e quem controla o gasto?",
    r: "O sistema funciona com OpenRouter, Anthropic ou OpenAI, e o provedor se troca pela tela. No plano com IA, o consumo entra num teto de US$ 15 por mês, e o cliente adiciona saldo ou habilita a cobrança automática do excedente. No plano sem IA, a empresa cadastra a própria chave. A tela de uso mostra o consumo.",
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
    "Por R$ 157 por mês, ou R$ 397 com a IA incluída, mais uma implantação de R$ 1.297 em até 3x sem juros, a Tektus coloca o Verdash CRM no seu WhatsApp e no seu Instagram, treina a sua equipe e acompanha os primeiros 30 dias.",
  assinatura: "Ninguém fica no vácuo.",
} as const;

export const META_DESCRICAO =
  "CRM de WhatsApp e Instagram com atendente de IA, implantado pela Tektus. Planos de R$ 157 e R$ 397 por mês e implantação de R$ 1.297 em até 3x sem juros.";
