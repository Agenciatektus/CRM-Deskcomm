/**
 * Cada recusa vira uma frase que diz O QUE FAZER — mesma regra do formulário de
 * Conversões. `cifra_indisponivel` é a que mais importa acertar: é problema de
 * INSTALAÇÃO, e um texto genérico mandaria o admin do tenant refazer um cadastro
 * que já está certo, para falhar igual.
 */
export const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Confira os campos: algum valor não está no formato esperado.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e o token não foi gravado. Quem instalou o sistema precisa configurá-la — refazer o cadastro aqui não resolve.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
  superada: "Não consegui gravar agora. Tente de novo em instantes.",
  rate_limited: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.",
  token_invalido:
    "A Meta não reconhece este token: ele está inválido, expirado ou revogado. Gere um novo e cole de novo.",
  token_de_pagina:
    "Este é um token de Página. Gere um token de usuário ou de usuário do sistema com a permissão ads_read.",
  sem_ads_read: "O token não tem a permissão ads_read. Gere-o de novo com essa permissão.",
  sem_contas: "Este token não enxerga nenhuma conta de anúncio. Confira se o usuário tem acesso às contas.",
  validacao_indisponivel: "Não consegui validar o token com a Meta agora. Tente de novo em instantes.",
};
