# E-mails transacionais do CRM

Inventário vivo. Atualize ao criar, remover ou mudar um envio. Fonte: `sendEmail(` em `lib/`, `app/`, `workers/` e as variáveis `GOTRUE_MAILER_*` do kit.

## O que enviamos hoje

Transporte "app" = `lib/email/roteador.ts`, que usa SMTP quando configurado e Resend quando não. Sem nenhum dos dois, devolve `not_configured` e cada fluxo segue seu caminho próprio. Transporte "GoTrue" = o GoTrue renderiza e envia; o app só serve o molde em `/email-templates/[modelo]`.

| E-mail | Gatilho | Modelo | Assunto | Destinatário | Transporte | Idioma |
|---|---|---|---|---|---|---|
| Confirmar e-mail | Cadastro | `acesso-gotrue.ts` (`confirmation`) | Confirme seu e-mail no {marca} | Quem se cadastrou | GoTrue | pt-BR |
| Redefinir senha | "Esqueci a senha" | `acesso-gotrue.ts` (`recovery`) | Redefina sua senha no {marca} | A própria pessoa | GoTrue | pt-BR |
| Confirmar troca de e-mail | Troca no Perfil | `acesso-gotrue.ts` (`email_change`) | Confirme a troca de e-mail no {marca} | Endereço atual e novo | GoTrue | pt-BR |
| Senha alterada | Troca de senha | `acesso-gotrue.ts` (`password_changed`) | Sua senha foi alterada no {marca} | A própria pessoa | GoTrue | pt-BR |
| Verificação em duas etapas ativada | MFA adicionado | `mfa_factor_enrolled` | Verificação em duas etapas ativada no {marca} | A própria pessoa | GoTrue | pt-BR |
| Verificação em duas etapas removida | MFA removido | `mfa_factor_unenrolled` | Verificação em duas etapas removida no {marca} | A própria pessoa | GoTrue | pt-BR |
| Login vinculado | Identidade (ex.: Google) vinculada | `identity_linked` | Novo login vinculado à sua conta no {marca} | A própria pessoa | GoTrue | pt-BR |
| Login desvinculado | Identidade desvinculada | `identity_unlinked` | Login desvinculado da sua conta no {marca} | A própria pessoa | GoTrue | pt-BR |
| Convite de equipe | Convite (`issue-invite.ts`, `sendOnboardingInvites.ts`) | `templates/invite.ts` | {quem convidou} convidou você para a {empresa} no {marca} | Convidado | app | pt-BR |
| Compra confirmada | Compra direta (`issue-invite.ts`, `origem: "compra"`) | `templates/invite.ts` | Sua empresa {empresa} está pronta no {marca} | Pagador | app | pt-BR |
| Aviso de troca de e-mail pelo admin da plataforma | PATCH admin de e-mail do membro | `templates/aviso-de-troca-de-email.ts` | O e-mail de login da sua conta foi trocado | Endereço antigo | app | do usuário (`locale`) |
| Régua de cobrança | Teste acabando, vencida, suspende em breve, suspensa, liberada (`lib/cobranca/avisos.ts`) | `templates/cobranca.ts` | {título do aviso} no {marca} | Admins ativos da empresa | app | da organização |
| Aviso ao dono da instalação | Compra direta nova ou repetida; troca da chave de cobrança | `templates/cobranca.ts` | {título} no {marca} | Platform admins de acesso total | app | pt-BR |
| Alerta de vencimento da Meta | Cron `meta-alerta-vencimento` | `templates/alerta-meta.ts` | {título} no {marca} | Admins da empresa | app | da organização |
| Exportação LGPD | Pedido aprovado por humano (`lgpd-export-worker`) | `lib/lgpd/email-delivery.ts` | Sua solicitação LGPD #{id} (Brasil); Pedido de acesso aos seus dados pessoais #{id} (fora) | Titular | app | pt-BR no Brasil, pt-PT nos demais perfis |
| Alarme de prazo LGPD | Cron `lgpd-sla-watcher` | `lib/lgpd/sla-alarm.ts` | {etiqueta} Solicitação {id} próxima do vencimento | DPO (coluna da organização ou `LGPD_DPO_EMAIL`) | app | do perfil do país |
| `send_email` de automação | Regra de automação | Conteúdo escrito pelo cliente | Escrito pelo cliente | Definido na regra | app | do cliente |

O `send_email` não é reformatado de propósito: assunto e corpo são do cliente (HTML ou texto) e passam só pelas variáveis da regra.

Não habilitados no GoTrue: `email_changed` (o app já avisa no caso do admin; no caso do próprio usuário vale o `email_change` acima) e `phone_changed` (o produto não tem fluxo de telefone). `magic_link`, `invite` e `reauthentication` do GoTrue não são usados: não há `signInWithOtp`, `inviteUserByEmail` nem `reauthenticate` no código.

## Não enviamos hoje

Cada item foi conferido no código (nenhum `sendEmail` nesses fluxos).

- Membro removido ou papel alterado (`app/api/v1/team/[user_id]/{role,revoke,reactivate}`). Segurança. Avisar a pessoa afetada; quem perde acesso hoje só descobre ao tentar entrar.
- Convite aceito avisando quem convidou (`app/actions/team/acceptInvite.ts`). Conveniência. Uma linha ao convidante evita a pergunta "já entrou?".
- Novo dispositivo ou login suspeito. Segurança. Não há detecção; o GoTrue não oferece esse aviso nativo. Exigiria registrar dispositivo, só vale se houver demanda.
- Exclusão de empresa concluída (`lib/tenants/exclusao.ts` só apaga usuários). Negócio. Confirmar por e-mail ao admin dá prova do que foi apagado.
- Recibo próprio de pagamento. Negócio. A cobrança é por provedor externo; o CRM só envia a régua. Avaliar se o recibo do provedor basta.
- Boas-vindas após o primeiro login. Conveniência. Só existe o convite; baixa prioridade.
- Exportação de dados do próprio usuário (fora do fluxo LGPD de contato). Conveniência. Não existe fluxo; o e-mail LGPD é para o titular externo.

Já enviado, portanto fora desta lista: teste acabando (`trial_acabando`) e avisos de vencimento e suspensão.

## Como mexer

- **Visual:** tokens e layout em `lib/email/layout.ts` (`TOKENS_EMAIL`, `montarEmail`). Mudou token, mudam todos os e-mails de uma vez.
- **Preview:** abra `/email-templates/<modelo>` no app (rota pública, sem sessão) para ver o molde dos 8 modelos do GoTrue. Os demais saem de testes em `lib/email/templates/*.test.ts`.
- **Texto novo do app que passa por `t()`:** precisa de espanhol em `lib/i18n/dicionario.ts` (catraca `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`).
- **Exige recriar o GoTrue:** qualquer `GOTRUE_MAILER_*` novo ou alterado (o kit grava em `.env` do Supabase e `supabase-single-server.override.yml`; `docker compose up -d` recria o `auth`). O texto dos moldes não exige: o GoTrue rebusca a cada `GOTRUE_MAILER_TEMPLATE_MAX_AGE` (10 min por padrão).
- **Variáveis Go dos avisos:** `{{ .Email }}` em todos; `{{ .FactorType }}` nos de MFA; `{{ .Provider }}` nos de identidade. Mapa completo em `lib/email/templates/acesso-gotrue.ts`.
- **Identidade fixa:** os e-mails usam a identidade do produto, sem white-label por organização (decisão do dono). A marca da instalação entra só no nome, no assunto e no texto.
- **Regra de texto:** pt-BR, sem travessão, tom curto.
