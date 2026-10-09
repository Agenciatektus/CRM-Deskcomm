# Auditoria: protótipo Inbox v2 (MainVerdash.dc.html) x CRM `origin/dev` (4e5a2b146)

Só leitura. Caminhos relativos à raiz do repo CRM-Deskcomm. "Back" = depende de backend ou dado que não existe (S/N).
Extras que só o CRM tem foram omitidos, salvo quando mudam o item comparado.

## 1. Sidebar

| # | Item do protótipo | Status | Evidência no CRM | Back |
|---|---|---|---|---|
| S1 | Trilho 72px, 5 módulos e Ajustes no rodapé | OK | components/shell/BarraEmDuasColunas.tsx:161-239 | N |
| S2 | Topo do trilho: botão da organização (iniciais, troca de org) | DIFERENTE | BarraEmDuasColunas.tsx:163 mostra o logo (MarcaDaBarra); a troca fica na topbar (TopBar.tsx:58) | N |
| S3 | Rótulo do 1º módulo "Atendimento" | DIFERENTE | lib/navigation/catalogo.ts:93 "Conversas" (decisão registrada no catálogo) | N |
| S4 | Badge da fila no módulo Atendimento | OK | BarraEmDuasColunas.tsx:204 | N |
| S5 | Ponto verde em Canais | OK | BarraEmDuasColunas.tsx:206 | N |
| S6 | Espiar ao passar o mouse (hover abre a 2ª coluna, sair fecha) | FALTA | components/shell/usePeekDoTrilho.ts:88 só abre no clique | N |
| S7 | Fixar/recolher no rodapé do trilho | OK | BarraEmDuasColunas.tsx:226-238 (cookie; ícone CaretDouble no lugar do painel) | N |
| S8 | Botão fixar no cabeçalho da 2ª coluna | FALTA | components/shell/ColunaDoGrupo.tsx:47 (só o h2) | N |
| S9 | Abaixo de 1024px: força recolhido e esconde o pino | FALTA | components/shell/Sidebar.tsx:229 (largura só por `collapsed`) | N |
| S10 | 2ª coluna 232px, título do módulo, títulos de seção | OK | BarraEmDuasColunas.tsx:247; ColunaDoGrupo.tsx:47,55 | N |
| S11 | Itens sem ícone, 34px de altura, 14px | DIFERENTE | ColunaDoGrupo.tsx:131-135 (ícone 16px, py-1.5) | N |
| S12 | Item ativo em card com anel | OK | ColunaDoGrupo.tsx:17 | N |
| S13 | Contador da fila em Inbox | OK | ColunaDoGrupo.tsx:139 | N |
| S14 | Contador de Tarefas atrasadas (tom crítico) | FALTA | catalogo.ts:54 (`contador` só "casos" ou "fila") | S |
| S15 | Contador em Alertas = abertos da central | FALTA | catalogo.ts:629 (sem contador) | N |
| S16 | Tags "Admin" e "Opcional" nos itens | FALTA | catalogo.ts:34-72 (não há campo; `minRole`/`modulo` existem para derivar) | N |
| S17 | Pipeline com filhos (um por funil) | OK | components/shell/NoDeFunis.tsx:79-105 | N |
| S18 | Contagem de leads abertos em cada funil | FALTA | lib/navigation/funis-no-menu.ts:34 (`FunilDoMenu` = id, name) | S |
| S19 | Nó Pipeline aberto por padrão | DIFERENTE | NoDeFunis.tsx:54 (abre só dentro de um funil ou no clique) | N |
| S20 | Ajustes abre a 2ª coluna com seções (Sua conta, Sua empresa, Vendas e agenda, Anúncios, Dados e acesso) | DIFERENTE | BarraEmDuasColunas.tsx:214-224 é link direto para /app/settings | N |
| S21 | Lista de páginas por módulo | DIFERENTE | 2ª coluna mostra o hub inteiro (lib/navigation/registry.ts:146) + "Ver tudo em X" (ColunaDoGrupo.tsx:87-100), que o protótipo não tem; nomes divergem (Tags x Etiquetas, Propostas x Propostas da IA) | N |
| S22 | Rodapé com versão | OK | BarraEmDuasColunas.tsx:261 | N |
| S23 | Peek com sombra; fecha com Esc e clique fora | OK | usePeekDoTrilho.ts:55-74 | N |
| S24 | Sidebar no tom chrome, sem borda | DIFERENTE | Sidebar.tsx:226 `border-r bg-background`; trilho com `border-r` (BarraEmDuasColunas.tsx:161) | N |

## 2. Topbar

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| T1 | Trilha Grupo › Página | OK | components/shell/TopBar.tsx:27-50 | N |
| T2 | Nota "N aguardando resposta" | OK | components/shell/AguardandoResposta.tsx:21 | N |
| T3 | Nota some abaixo de 1280px | DIFERENTE | TopBar.tsx:34 (a trilha inteira some só abaixo de md) | N |
| T4 | Gatilho de busca central (até 440px) com Ctrl K | OK | components/shell/SearchTrigger.tsx:35-52 | N |
| T5 | Texto "Buscar contato, conversa ou lead" | DIFERENTE | SearchTrigger.tsx:48 "Buscar telas e funções" | N |
| T6 | Paleta: Recentes / Contatos e conversas / Leads (selo "novo") | FALTA | components/shell/CommandPalette.tsx:18 "v1 busca só NAVEGAÇÃO" | N (search existe em /api/v1/conversations e /contacts; leads parcial) |
| T7 | Paleta: grupo Ações (próximo passo, tema, disponibilidade, ver avisos, filtro sem próximo passo) | FALTA | CommandPalette.tsx (só destinos) | N |
| T8 | Paleta: "Quadro <funil>" como tela | FALTA | CommandPalette.tsx:61 (`searchable()` sem funis) | N |
| T9 | Paleta: palavras em qualquer ordem, apelidos, dígitos do telefone | DIFERENTE | CommandPalette.tsx:~118 (substring da frase inteira) | N |
| T10 | Paleta: lista compacta em 1 coluna, rodapé com kbd | DIFERENTE | CommandPalette.tsx:40 (max-w-3xl, chips de categoria, grade de 2 colunas) | N |
| T11 | Disponibilidade em pílula com ponto | OK | components/shell/BotaoDeDisponibilidade.tsx:39-59 | N |
| T12 | Rótulo "Ausente" + toast que explica a fila | DIFERENTE | BotaoDeDisponibilidade.tsx:58 "Indisponível"; toast genérico :31 | N |
| T13 | Central de avisos em popover | FALTA | components/shell/AlertsBell.tsx:35 (Link para /app/ai/inbox) | N (hooks/ai/useAgentInbox.ts tem lista, PATCH e resolve-all) |
| T14 | Abas Abertos / Resolvidos com contagem | FALTA | idem | N |
| T15 | "Marcar todos resolvidos" com Desfazer | FALTA | idem | N (desfazer em lote: S) |
| T16 | Item com ícone por tipo (handoff, sem dono, QR, resultado, lembrete, outro), título, hora, sub | FALTA | idem | N |
| T17 | Ação do item (Abrir conversa / Assumir / Reconectar) | FALTA | idem | N |
| T18 | Resultado do compromisso: Compareceu / Faltou / Remarcou | FALTA | idem | S |
| T19 | Resolver (✓) e Reabrir por item | FALTA | idem | N |
| T20 | Vazio da central + "Abrir a central completa" | FALTA | idem | N |
| T21 | Badge vermelho com contagem no sino | OK | AlertsBell.tsx:46-52 | N |
| T22 | Botão de tema | OK | components/shell/UserMenu.tsx:36 | N |
| T23 | Conta (avatar) | OK | UserMenu.tsx | N |
| T24 | Topbar sem borda, no tom chrome | DIFERENTE | TopBar.tsx:55 `border-b bg-background/95 backdrop-blur` | N |

## 3. Lista

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| L1 | Busca na lista | OK | components/inbox/InboxFilters.tsx:238-245 | N |
| L2 | Botão Filtros com contador + popover | OK | components/inbox/filtros/PopoverDeFiltros.tsx | N |
| L3 | Só não lidas | OK | InboxFilters.tsx:175 | N |
| L4 | Sem próximo passo | FALTA | PopoverDeFiltros.tsx (não existe) | S |
| L5 | Número de WhatsApp | OK | PopoverDeFiltros.tsx | N |
| L6 | Tags | OK | filtros/SeletorDeEtiqueta.tsx | N |
| L7 | Chips de filtro ativos | OK | filtros/ChipsDeFiltro.tsx | N |
| L8 | Abas Fila / Minhas / Todas com contagem | OK | filtros/AbasDaInbox.tsx:66-81 | N |
| L9 | "Mais": Com a IA, Fechadas, Arquivadas, com ícones | DIFERENTE | InboxFilters.tsx:19-31 (ordem Fechadas, Arquivadas, "Automático"; sem ícone) | N |
| L10 | Abas com 30px / 13px | DIFERENTE | AbasDaInbox.tsx:73 (h-7, text-xs) | N |
| L11 | Cabeçalho de seção (rótulo + total) | OK | components/inbox/ConversationList.tsx:194 | N |
| L12 | Avatar 40px + selo do canal | OK | components/inbox/ConversationListItem.tsx:158-174 | N |
| L13 | Selecionada: fundo accent-soft + barra 3px | DIFERENTE | ConversationListItem.tsx:149 `bg-surface-elevated` (a barra existe, :156) | N |
| L14 | Prefixo "Você:" / "IA:" na prévia | DIFERENTE | ConversationListItem.tsx:219 (só robô quando automático) | S |
| L15 | Prévia cortada por CSS | DIFERENTE | ConversationListItem.tsx:88 (corta em 60 caracteres) | N |
| L16 | Não lida: badge, nome e hora em destaque | OK | ConversationListItem.tsx:182-231 | N |
| L17 | Ícones de fixada e silenciada | OK | components/inbox/item/IconesPessoais.tsx | N |
| L18 | Pílula de espera com tom | OK | components/inbox/item/MetaDaConversa.tsx:161-171 | N |
| L19 | Pílula de dono (IA, Você, Sem dono, nome, IA pausada, Fechada, Bloqueado) | DIFERENTE | MetaDaConversa.tsx:65 "Automático"; sem "IA pausada" e "Fechada" | N |
| L20 | Pílula "Tarefa atrasada" / "Sem próximo passo" | FALTA | MetaDaConversa.tsx (não existe) | S |
| L21 | Uma etiqueta só, escondida quando há pílula de tarefa | DIFERENTE | MetaDaConversa.tsx:98 (até 2 + "+N") | N |
| L22 | Botão "…" na linha + menu de contexto | OK | components/inbox/menu/BotaoMaisAcoes.tsx; MenuDaConversa.tsx | N |
| L23 | Vazios por aba e por filtro | OK | components/inbox/VazioDaAba.tsx; EmptyPorFiltro.tsx | N |
| L24 | Densidade compacta (linha 8px) | FALTA | sem opção | N |

## 4. Cabeçalho da conversa

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| H1 | Nome + status Aberta/Fechada | OK | components/inbox/cabecalho/IdentidadeDaConversa.tsx:50-60 | N |
| H2 | Sub-linha canal · telefone · "X está atendendo" | DIFERENTE | IdentidadeDaConversa.tsx:72-84 (dono como badge compacto) | N |
| H3 | "Puxar para mim" quando outro atende | DIFERENTE | components/inbox/ConversationHeader.tsx:175 (sempre "Assumir") | N |
| H4 | "Devolver à IA" | DIFERENTE | ConversationHeader.tsx:194 "Devolver ao automático" | N |
| H5 | Reabrir quando fechada | OK | ConversationHeader.tsx:197-208 | N |
| H6 | Transferir (popover com equipe) | OK | cabecalho/TransferirPopover.tsx | N |
| H7 | Lembrar depois (popover) | OK | components/inbox/SnoozeButton.tsx | N |
| H8 | Fechar conversa direto pelo ícone | DIFERENTE | ConversationHeader.tsx:249 (abre confirmação) | N |
| H9 | Mais ações: buscar, pausar automático, arquivar | OK | cabecalho/MaisAcoes.tsx:85-125 | N |
| H10 | Alternar painel do lead | OK | cabecalho/AlternarPainel.tsx | N |
| H11 | Janela 24h com medidor | OK | components/inbox/JanelaSelo.tsx:134-141 | N |
| H12 | Espera longa e lembrete na faixa | OK | cabecalho/FaixaDeStatus.tsx:97-115 | N |
| H13 | "Entrou por <origem>" para qualquer origem (anúncio, indicação, Google Ads, formulário) | DIFERENTE | FaixaDeStatus.tsx:74-76,134 (só Direct/Comentário do Instagram) | S |
| H14 | Voltar no celular | OK | components/inbox/InboxLayout.tsx:463-472 | N |

## 5. Thread / bolhas

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| B1 | Separador de dia fixo no topo | OK | components/inbox/fio/linhas.ts; ChatThread.tsx:263 | N |
| B2 | Divisor de mensagens novas | OK | fio/useDivisorDeNovas.ts ("Novas mensagens") | N |
| B3 | Cartão "A IA passou o atendimento" (quer / tentou / cliente avisado / Assumir e responder) | OK | components/inbox/PassagemCard.tsx; passagem/* | N |
| B4 | Bolhas agrupadas por autor, cantos achatados | OK | components/inbox/bolha/estilo.ts:55-61 | N |
| B5 | Rótulo acima da bolha (IA, nota "só a equipe vê") | OK | bolha/autoria.ts | N |
| B6 | Nota interna tracejada no tom de aviso | OK | bolha/estilo.ts | N |
| B7 | Citação dentro da bolha | OK | bolha/CitacaoNaBolha.tsx | N |
| B8 | Imagem, figurinha, documento, apagada, editada | OK | components/inbox/media/* | N |
| B9 | Vídeo com capa, play e duração | DIFERENTE | media/VideoMedia.tsx:38 (controles nativos) | N |
| B10 | Áudio com forma de onda | DIFERENTE | media/AudioPlayer.tsx:140 (barra de progresso) | S |
| B11 | Velocidade do áudio | OK | AudioPlayer.tsx | N |
| B12 | Transcrição recolhível | OK | bolha/TranscricaoDoAudio.tsx | N |
| B13 | Cartão de contato com botão "Conversar com X" | DIFERENTE | media/ContactCard.tsx:134 (cartão inteiro clicável) | N |
| B14 | Hora e ticks dentro da bolha (enviada, entregue, lida, falhou) | OK | bolha/ConfirmacoesDaBolha.tsx | N |
| B15 | "Não foi enviada. Tentar de novo" | FALTA | só o selo "Falhou"; não há rota de reenvio em app/api/v1/messages | S |
| B16 | Responder ao passar o mouse | OK | fio/LinhaDaMensagem.tsx | N |
| B17 | Raio 18px | DIFERENTE | bolha/estilo.ts:55 `rounded-2xl` (16px) | N |

## 6. Composer

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| C1 | Abas Responder / Nota interna + dica do Enter | OK | components/inbox/composer/FaixasDoComposer.tsx:113-134 | N |
| C2 | Nota tracejada; foco com anel do accent | OK | components/inbox/Composer.tsx:~236 | N |
| C3 | Anexar, emoji, respostas rápidas (/), Sugerir resposta, gravar áudio, Enviar | OK | composer/BarraDoComposer.tsx e vizinhos | N |
| C4 | Faixa SUBSTITUI a caixa enquanto você não é o dono | DIFERENTE | Composer.tsx:226 (FaixaDoDono acima; a caixa segue ativa) | N |
| C5 | Faixa "X está atendendo. Deixe uma nota ou puxe a conversa" | FALTA | composer/FaixaDoDono.tsx:52 (retorna null quando outro atende) | N |
| C6 | Faixa da fila com o tempo de espera | DIFERENTE | FaixaDoDono.tsx:75 (sem o tempo) | N |
| C7 | Conversa fechada: faixa com "Reabrir" | DIFERENTE | components/inbox/PainelDaConversa.tsx:~150 (só `disabled`) | N |
| C8 | Contato bloqueado: faixa com "Desbloquear" | DIFERENTE | PainelDaConversa.tsx:97 (texto, sem botão) | N |
| C9 | Janela fechada ou cliente nunca escreveu: "Escolher modelo" | OK | components/inbox/JanelaFechadaAviso.tsx; composer/TemplateMenu.tsx | N |

## 7. Painel do lead

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| P1 | Cabeçalho: avatar 48, nome 17px, telefone com copiar | OK | components/inbox/painel/CabecalhoDoPainel.tsx:84-86 | N |
| P2 | "Assunto: …" | FALTA | CabecalhoDoPainel.tsx | S |
| P3 | Etiquetas + "+ Etiqueta" | OK | CabecalhoDoPainel.tsx | N |
| P4 | Atalhos Próximo passo / Detalhes / Obs; alerta quando falta ou atrasa a tarefa | DIFERENTE | CabecalhoDoPainel.tsx:147-154 (alerta só sem tarefa) | N |
| P5 | Abas Resumo / Negócios / Empresa / Atividade | OK | components/inbox/CRMSidePanel.tsx:25-28 | N |
| P6 | Resumo: acordeões com resumo de 1 linha (prazo, "x de y campos", texto da Obs) | DIFERENTE | painel/AbaResumo.tsx:47-104 (blocos fixos com Separator) | N |
| P7 | Tarefa: concluir, prazo com tom, responsável, Reagendar, Abrir em Tarefas | OK | painel/ProximoPasso.tsx | N |
| P8 | Calendário: atalhos Hoje / Amanhã / Segunda / Em 7 dias e linha-resumo | FALTA | painel/SeletorDeDataHora.tsx | N |
| P9 | Criar tarefa: título, chips rápidos, quando, responsável, dica | OK | painel/NovaTarefaRapida.tsx; QuandoFazer.tsx | N |
| P10 | Detalhes: edição no lugar, por campo | OK | painel/DetalhesDoContato.tsx:56-127 | N |
| P11 | Detalhes: CPF/CNPJ, Cidade e grupo "Campos do funil" | FALTA | DetalhesDoContato.tsx:18-22 (Nome, E-mail, Nascimento; campos do funil ficam em Negócios, EditorDoNegocio.tsx:69) | S |
| P12 | Obs salva sozinha + "Última edição: quem, quando" | DIFERENTE | painel/ObservacoesDoContato.tsx:93 (salva no blur, sem autor) | S |
| P13 | Negócios: menu … do lead (Editar, Abrir no quadro, Excluir) | FALTA | painel/EditorDoNegocio.tsx | N |
| P14 | Chip do funil + valor em destaque | DIFERENTE | EditorDoNegocio.tsx:123 (linha de texto) | N |
| P15 | Etapas em barra de passos clicável | DIFERENTE | EditorDoNegocio.tsx:131 (SeletorDeEtapa = Select) | N |
| P16 | Responsável do negócio | OK | painel/ResponsavelDoNegocio.tsx | N |
| P17 | Ganho / Perdido / Outro funil | OK | painel/AcoesDoNegocio.tsx:111-118 | N |
| P18 | Perdido: motivos em chips + detalhe, no próprio painel | DIFERENTE | AcoesDoNegocio.tsx:165 (LoseLeadDialog) | N |
| P19 | Outro funil: funil + etapa no próprio painel | DIFERENTE | AcoesDoNegocio.tsx:177 (MoveToOtherPipelineDialog) | N |
| P20 | Faixa ganho/perdido com Reabrir | OK | AcoesDoNegocio.tsx:92-103 | N |
| P21 | Excluir lead com confirmação | FALTA | — | N |
| P22 | Sem lead: "Criar lead" | OK | painel/AbaNegocios.tsx:59-87 ("Sem leads." + "Novo Lead") | N |
| P23 | Pedidos recentes | OK | AbaNegocios.tsx:100-123 | N |
| P24 | Empresa: nota, endereço, site, redes, aviso de dado público | OK | components/inbox/LeadEnrichment.tsx | N |
| P25 | Empresa vazia com "Buscar dados da empresa" | FALTA | LeadEnrichment.tsx (só o texto de vazio) | N (rota companies/[id]/enrich existe, por empresa) |
| P26 | Atividade em linha do tempo com pontos | DIFERENTE | painel/AbaAtividade.tsx:30-37 (cartões com borda) | N |

## 8. Estados vazios, toasts, atalhos e menu de contexto

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| E1 | Conversa vazia: "Escolha uma conversa / A fila mostra primeiro quem espera há mais tempo" | DIFERENTE | InboxLayout.tsx:533-535 ("Selecione uma conversa / Ou navegue com J e K") | N |
| E2 | Toast escuro, embaixo no centro, com "Desfazer" | DIFERENTE | app/layout.tsx:300 (sonner top-right) | N |
| E3 | Desfazer em ganho, perdido, mover funil, excluir lead e resolver todos | FALTA | AcoesDoNegocio.tsx (toasts sem desfazer; só responsável e menu têm) | N |
| E4 | Ctrl/Cmd+K | OK | SearchTrigger.tsx:35 | N |
| E5 | Atalhos da linha A / U / P / E e Shift+F10 | OK | components/inbox/InboxKeyboardShortcuts.tsx:62-79; menu | N |
| E6 | Teclas visíveis no menu de contexto (kbd A, U, P, E) | FALTA | components/inbox/menu/*.tsx | N |
| E7 | Menu: "Criar / ver próximo passo" | FALTA | menu/ConteudoDoMenu.tsx | N |
| E8 | Menu: "Nova etiqueta" no submenu | FALTA | menu/SubmenusDaConversa.tsx | N |
| E9 | Menu: "Criar lead" no submenu Funil | FALTA | menu/SubmenuDoFunil.tsx ("Este contato não tem negócio") | N |
| E10 | Menu: alterna "Marcar como lida" | DIFERENTE | só "Marcar como não lida" | N |
| E11 | Esc fecha popovers | OK | Radix | N |

## 9. Layout e geometria

| # | Item | Status | Evidência | Back |
|---|---|---|---|---|
| G1 | Colunas redimensionáveis (arrastar, setas, duplo clique volta ao padrão) | FALTA | InboxLayout.tsx:378-381 (grid fixo) | N |
| G2 | Larguras salvas por usuário | FALTA | idem | N |
| G3 | Mínimo de 420px para a conversa | FALTA | idem | N |
| G4 | Padrão lista 340 (280–480), painel 352 (300–520) | DIFERENTE | InboxLayout.tsx:378-381 (lista 272/300; painel 296/360/400 por breakpoint) | N |
| G5 | Painel some abaixo de 1280 e vira gaveta | OK | InboxLayout.tsx:541 (xl:block); Sheet :475 | N |
| G6 | Celular: uma coluna por vez | OK | InboxLayout.tsx:56 | N |
| G7 | Área de trabalho como cartão colado à sidebar (margem 0 8 8 0, raio 14) sobre fundo chrome | DIFERENTE | app/app/_components/AppShell.tsx:86 (`main p-6`); InboxLayout.tsx:378 (rounded-xl, altura com space-6) | N |
| G8 | Topbar 56px | OK | TopBar.tsx:55 (h-14) | N |
| G9 | Linha da lista 12/14px | OK | ConversationListItem.tsx:144 | N |
| G10 | Cabeçalho da conversa com 64px ou mais | OK | ConversationHeader.tsx:141 | N |
