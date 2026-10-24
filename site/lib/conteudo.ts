/**
 * Toda a copy e as constantes da LP num lugar só: a página, o JSON-LD, o
 * `llms.txt` e o `sitemap` leem daqui, para que o texto que o visitante lê e o
 * que a IA cita nunca divirjam.
 *
 * Regras do texto: pt-BR, sem número de resultado que não seja verificável,
 * nada de "não é X, é Y", nada de travessão. Cada afirmação sobre o produto
 * sai do README ou do CHANGELOG do CRM.
 */

export const SITE = {
  nome: "Verdash CRM",
  url: "https://crm.verdash.com.br",
  descricao:
    "CRM com agentes de inteligência artificial para negócios que vendem pelo WhatsApp: conversas, funil e atendimento automático com passagem para uma pessoa, implantado e acompanhado pela Tektus.",
  /** WhatsApp comercial da Tektus (o mesmo da LP de tráfego da agência). */
  whatsapp: "5521977357727",
  atualizadoEm: "2026-10-24",
} as const;

export function linkWhatsapp(mensagem: string): string {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

export const CTA = {
  rotulo: "Pedir um diagnóstico",
  mensagem: "Oi, quero um diagnóstico do Verdash CRM para o meu negócio.",
} as const;

export const NAV = [
  { href: "#como-funciona", rotulo: "Como funciona" },
  { href: "#agente", rotulo: "O agente de IA" },
  { href: "#implantacao", rotulo: "Implantação" },
  { href: "#faq", rotulo: "Perguntas" },
] as const;

export const HERO = {
  eyebrow: "CRM com agentes de IA para quem vende pelo WhatsApp",
  titulo: "Todo lead que chama no WhatsApp ganha dono, resposta e próximo passo.",
  texto:
    "O Verdash CRM reúne conversas, funil de vendas e agentes de inteligência artificial num só lugar. A IA atende e qualifica. Quando a conversa pede uma pessoa, ela passa o bastão com o histórico inteiro.",
  nota: "Implantação e acompanhamento feitos pela Tektus.",
} as const;

export const PROBLEMAS = [
  {
    titulo: "O lead respondeu e ninguém retomou.",
    texto:
      "O cliente pergunta o preço, recebe a resposta e some. Sem alguém olhando as conversas que esfriam, o lead morre em silêncio e a equipe só descobre no fim do mês.",
  },
  {
    titulo: "O robô atende, mas ninguém sabe o que ele prometeu.",
    texto:
      "Atendimento automático sem registro vira risco: se o robô prometeu prazo ou desconto que não existe, a empresa descobre pelo cliente. No Verdash CRM as respostas da IA ficam na própria conversa, as execuções do agente ficam registradas e a passagem para uma pessoa é uma etapa do processo.",
  },
  {
    titulo: "A conversa mora num lugar e o funil em outro.",
    texto:
      "Planilha de um lado, WhatsApp pessoal do outro, funil no terceiro. Quando cada coisa mora num lugar, ninguém enxerga o negócio inteiro.",
  },
] as const;

export const ETAPAS = [
  {
    titulo: "O lead chama",
    texto:
      "Pelo WhatsApp (QR code ou canal oficial da Meta) ou pelo Instagram. A conversa cai na Inbox, onde a equipe e a IA aparecem lado a lado.",
  },
  {
    titulo: "O agente atende e qualifica",
    texto:
      "Responde com o conhecimento que a empresa cadastrou, pergunta o que falta e move o negócio de etapa no funil conforme a conversa avança.",
  },
  {
    titulo: "O funil mostra onde cada negócio está",
    texto:
      "Um quadro com as etapas do seu jeito. O mesmo funil serve clínica, imobiliária, infoproduto ou loja, com o vocabulário de cada uma.",
  },
  {
    titulo: "Uma pessoa assume quando precisa",
    texto:
      "A conversa passa para um atendente com o histórico completo, e fica registrado quem assumiu e quando.",
  },
  {
    titulo: "Nada esfria em silêncio",
    texto:
      "O follow-up retoma a conversa que parou, com tempo adaptativo e gatilhos por etapa. O Radar lista o que está em risco de morrer sem resposta.",
  },
] as const;

export const AGENTE = {
  titulo: "Um agente que trabalha dentro do CRM, com rédea.",
  texto:
    "O agente de IA do Verdash CRM opera dentro do CRM: lê a conversa, consulta a base de conhecimento da empresa e executa tarefas. Cada freio abaixo existe no produto.",
  itens: [
    {
      rotulo: "Conhecimento próprio",
      texto:
        "Responde com o que a sua empresa cadastrou (catálogo, preços, regras), separado por organização.",
    },
    {
      rotulo: "Tarefas no CRM",
      texto:
        "Executa skills durante o atendimento, como mover o negócio de etapa ou criar um agendamento.",
    },
    {
      rotulo: "Passagem para uma pessoa",
      texto:
        "A passagem da IA para um atendente é auditada: fica registrado quem assumiu e quando.",
    },
    {
      rotulo: "Teto de gasto",
      texto:
        "Cada organização tem um teto de gasto com IA, e a tela de uso mostra quanto foi consumido.",
    },
    {
      rotulo: "Melhora com aprovação",
      texto:
        "O agente sugere melhorias para si mesmo, e nada muda sem uma pessoa aprovar a versão nova.",
    },
    {
      rotulo: "Provedor à escolha",
      texto: "OpenRouter, Anthropic ou OpenAI, trocável pela tela, por parte do sistema.",
    },
  ],
} as const;

export const NICHOS = {
  titulo: "Um CRM, vários jeitos de vender.",
  texto:
    "Você nomeia o funil do seu negócio. O lead vira Paciente, Cliente ou Comprador, e o negócio ganho vira Agendado, Fechado ou Pago. Serve a clínicas, imobiliárias, infoprodutos, agências, lojas e prestadores de serviço, tudo que vende pelo WhatsApp.",
  exemplos: [
    { negocio: "Clínica", lead: "Paciente", ganho: "Agendado" },
    { negocio: "Infoproduto", lead: "Comprador", ganho: "Pago" },
    { negocio: "Serviços", lead: "Cliente", ganho: "Fechado" },
  ],
} as const;

export const IMPLANTACAO = {
  titulo: "A Tektus implanta e acompanha.",
  texto:
    "A Tektus conduz a implantação do começo ao go-live e acompanha os primeiros 30 dias de uso, para a equipe não começar com uma ferramenta vazia.",
  passos: [
    { titulo: "Diagnóstico", texto: "Como o seu comercial funciona hoje e onde a venda se perde." },
    {
      titulo: "Configuração",
      texto: "Empresa, equipe, funis, campos e o canal de WhatsApp conectado.",
    },
    {
      titulo: "Agentes de IA",
      texto: "Agentes treinados com o conhecimento e as regras do seu negócio.",
    },
    {
      titulo: "Treinamento e go-live",
      texto: "A equipe aprende a operar e o atendimento entra no ar.",
    },
    {
      titulo: "Acompanhamento de 30 dias",
      texto: "Ajustes com base no que a operação real mostrou.",
    },
  ],
} as const;

export const SEGURANCA = {
  titulo: "Dados separados por empresa, com registro de tudo que importa.",
  itens: [
    {
      rotulo: "Isolamento",
      texto:
        "Cada empresa enxerga só os próprios dados. O teste de isolamento roda a cada alteração do código e barra a publicação se falhar.",
    },
    {
      rotulo: "Permissões",
      texto:
        "Quatro papéis de acesso, aplicados no servidor, e verificação em duas etapas que pode ser exigida por papel.",
    },
    {
      rotulo: "Auditoria",
      texto:
        "Atribuições, transferências e ações sensíveis ficam num registro que só recebe novas linhas, com retenção de 5 anos.",
    },
    {
      rotulo: "LGPD",
      texto: "Exportação e anonimização de dados do contato, e consentimento registrado.",
    },
  ],
} as const;

export const FAQ = [
  {
    p: "O que é o Verdash CRM?",
    r: "É um CRM para negócios que vendem pelo WhatsApp. Reúne as conversas, o funil de vendas e agentes de inteligência artificial que atendem e qualificam o lead, e passam a conversa para uma pessoa quando é preciso. A Tektus faz a implantação e o acompanhamento.",
  },
  {
    p: "A IA atende sozinha? Quando ela passa para uma pessoa?",
    r: "O agente atende e qualifica sozinho dentro das regras que a empresa define. Quando a conversa pede uma pessoa, a IA passa o atendimento a um atendente com o histórico completo, e a passagem fica registrada com quem assumiu e quando.",
  },
  {
    p: "Funciona com o WhatsApp oficial da Meta ou só por QR code?",
    r: "Funciona dos dois jeitos. Por QR code, com proteções contra bloqueio de número (ritmo de envio e janela de horário), ou pelo canal oficial da Meta, com os modelos de mensagem aprovados e sincronizados. Também atende conversas do Instagram.",
  },
  {
    p: "Quanto custa?",
    r: "O valor depende do tamanho da operação e do que precisa ser configurado. A proposta sai do diagnóstico, feito pela Tektus sem compromisso. Não há preço de tabela, porque cada implantação muda de tamanho.",
  },
  {
    p: "Meus dados e os dos meus clientes ficam seguros?",
    r: "Os dados de cada empresa ficam isolados, com teste de isolamento a cada alteração, permissões por papel e registro de auditoria. Há exportação e anonimização de dados de contato para a LGPD, e verificação em duas etapas que pode ser exigida por papel.",
  },
  {
    p: "O que a Tektus faz na implantação?",
    r: "Faz o diagnóstico do comercial, configura empresa, equipe, funis e canal, treina os agentes de IA com o conhecimento do negócio, treina a equipe, coloca o atendimento no ar e acompanha os primeiros 30 dias de uso.",
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
  titulo: "Quer ver como ficaria no seu comercial?",
  texto:
    "Conte pelo WhatsApp como você atende hoje. A Tektus faz o diagnóstico e mostra o que o Verdash CRM mudaria na sua operação.",
} as const;

export const FAIXA = [
  "WhatsApp por QR code",
  "WhatsApp oficial da Meta",
  "Instagram",
  "Google Agenda",
  "Google Ads",
  "OpenRouter",
  "Anthropic",
  "OpenAI",
  "Funil por nicho",
  "Radar de conversas",
  "Auditoria",
  "LGPD",
] as const;

export const RADAR = {
  titulo: "Conversa que esfria aparece antes de morrer.",
  texto:
    "O Radar lista as conversas sem resposta, há quanto tempo estão paradas e qual é a próxima ação. O follow-up propõe a mensagem de retomada, respeita a janela de horário do canal e usa tempo adaptativo com gatilhos por etapa.",
} as const;

export const CANAIS = {
  titulo: "Os canais que o seu cliente já usa.",
  texto:
    "WhatsApp e Instagram chegam na mesma Inbox, com a equipe e a IA lado a lado. Você escolhe como conectar o WhatsApp.",
} as const;
