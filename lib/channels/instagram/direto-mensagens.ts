/**
 * O que a pessoa lê quando o Instagram direto não conecta.
 *
 * Duas entradas, uma saída: o `motivo` que a plataforma põe na URL de retorno (a Meta negou,
 * o pedido expirou) e o `erro` que o servidor devolve ao concluir. Cada texto é um LITERAL
 * dentro de `t()`: o extrator do dicionário em espanhol só enxerga literal, e t com variável
 * derrubou o CI antes.
 *
 * Serve ao servidor (`t` = `traduzir` com o idioma do usuário) e à tela (`t` = `useT()`).
 * O `motivo` vem de uma URL: nunca é refletido, só escolhe entre estes textos.
 */
type T = (texto: string) => string;

export function mensagemDoMotivo(motivo: string | null | undefined, t: T): string {
  switch (motivo) {
    case "negado":
      return t("A Meta não recebeu a sua autorização. Clique em Conectar com o Instagram e aceite as permissões pedidas.");
    case "expirado":
      return t("O pedido de conexão expirou. Comece de novo para gerar outro.");
    case "conta_ja_conectada":
      return t("Esta conta de Instagram já está conectada em outra agência. Peça a desconexão por lá antes de conectar aqui.");
    case "pedido_ja_usado":
      return t("Este pedido de conexão já foi usado. Comece de novo.");
    case "falha_na_conexao":
      return t("A Meta não concluiu a conexão. Tente de novo em instantes.");
    case "codigo_ausente":
      return t("A Meta não devolveu a autorização. Tente de novo.");
    case "erro_interno":
      return t("O serviço de conexão falhou. Tente de novo em instantes.");
    default:
      return t("Não foi possível conectar o Instagram. Tente de novo.");
  }
}

export function mensagemDoErro(erro: string, t: T): string {
  switch (erro) {
    case "pedido_invalido":
      return t("Não foi possível concluir a conexão nesta sessão. Comece de novo pelo botão Conectar com o Instagram.");
    case "pedido_ja_concluido":
      return t("Este pedido já foi concluído. Confira a conta na lista de conexões.");
    case "pedido_nao_autorizado":
      return t("A autorização na Meta ainda não terminou. Comece de novo.");
    case "pedido_expirado":
      return t("O pedido de conexão expirou. Comece de novo para gerar outro.");
    case "instancia_indisponivel":
      return t("A instância desta conta não está disponível no serviço de conexão agora. Tente em instantes ou fale com o suporte.");
    case "webhook_url_recusada":
      return t("O serviço de conexão recusou o endereço de recebimento desta instalação. Fale com o suporte.");
    case "indisponivel":
      return t("Não foi possível falar com o serviço de conexão agora. Tente em instantes.");
    case "limite_de_orgs":
      return t("Esta instalação atingiu o limite de contas do serviço de conexão. Fale com o suporte.");
    case "recusado":
    case "nao_configurado":
      return t("O serviço de conexão recusou o pedido. Fale com o suporte.");
    case "sem_endereco_publico":
      return t("Esta instalação não sabe o próprio endereço público. Configure NEXT_PUBLIC_APP_URL antes de conectar.");
    case "cifra_indisponivel":
      return t("A cifra está indisponível nesta instalação e a credencial não foi gravada.");
    case "conta_em_outra_organizacao":
      return t("Esta conta de Instagram já está conectada em outra organização desta instalação.");
    default:
      return t("A conta foi autorizada, mas não foi possível gravar o canal. Tente de novo.");
  }
}

/** Status HTTP de cada erro. `pedido_invalido` é o genérico de qualquer divergência de sessão. */
export function statusDoErro(erro: string): number {
  switch (erro) {
    case "pedido_invalido":
      return 422;
    case "pedido_ja_concluido":
    case "pedido_nao_autorizado":
    case "instancia_indisponivel":
    case "conta_em_outra_organizacao":
      return 409;
    case "pedido_expirado":
      return 410;
    case "limite_de_orgs":
      return 429;
    case "sem_endereco_publico":
    case "webhook_url_recusada":
    case "cifra_indisponivel":
      return 422;
    case "falha_ao_gravar":
      return 500;
    default:
      return 502;
  }
}
