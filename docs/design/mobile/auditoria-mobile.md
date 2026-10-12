# Auditoria mobile do CRM (fase M0) — 12/10/2026

Referência: `docs/design/mobile/MobileVerdash.dc.html` (protótipo aprovado, versão 37 do artefato de Design).
Comparado com `origin/dev` em `8076ef7c8`, abaixo de 760px. Nenhuma tela foi alterada nesta fase.

**Decisões fixas:** app abaixo de 760px (tablet e desktop não mudam); CRM inteiro; PWA instalável; barra inferior
com 5 abas (Conversas, Funil, Tarefas, Avisos, Mais), com contadores, sem botão central, FAB por tela; navegação
empilhada com voltar; folhas inferiores no lugar de popovers; gestos de deslizar na lista; tema escuro = pele
Verdash, claro = marca do revendedor.

**Como o CRM funciona hoje no celular:** a casca é a do desktop com o trilho escondido (`AppShell.tsx:81`
`hidden md:block`). Em cima fica a `TopBar` (`TopBar.tsx:58-77`): hambúrguer que abre uma gaveta lateral com o
menu inteiro (`MobileSidebar.tsx:27-46`), organização, lupa de 36px, sino, avatar. O `<main>` tem `p-6`
(`AppShell.tsx:116`). A Inbox alterna lista e conversa pelo corte `md` = 768px (`InboxLayout.tsx:58-63`). Não
existe barra inferior, FAB, folha inferior própria, gesto nem área segura.

Status: **FALTA** (não existe), **DIFERENTE** (existe com outra forma ou medida), **OK**. "Backend" diz se a peça
precisa de rota ou campo novo.

## Resumo por tela

| # | Tela | FALTA | DIFERENTE | OK |
|---|---|---|---|---|
| 01 | Conversas | 5 | 5 | 2 |
| 02 | Conversa aberta | 2 | 6 | 3 |
| 03 | Ficha do lead | 1 | 5 | 3 |
| 04 | Folha de filtros | 2 | 2 | 2 |
| 05 | Folha do botão criar | 2 | 2 | 0 |
| 06 | Funil | 1 | 5 | 2 |
| 07 | Tarefas | 3 | 2 | 1 |
| 08 | Avisos | 1 | 1 | 3 |
| 09 | Mais | 3 | 4 | 1 |
| 10 | Canais | 1 | 2 | 2 |
| 11 | Busca aberta | 0 | 2 | 3 |
| | **Total (79 elementos)** | **21** | **36** | **22** |
| | Base do app (transversal, 12 itens) | 4 | 6 | 2 |

## 01 Conversas

| Elemento do protótipo | Status | Evidência hoje | Backend |
|---|---|---|---|
| Barra inferior, 5 abas com contador | FALTA | gaveta lateral `MobileSidebar.tsx:27-46`; contadores já existem `Sidebar.tsx:150-153` | não |
| Cabeçalho grande "Conversas" 32px + ⋯ (folha: marcar todas lidas, selecionar, disponível, respostas rápidas) | FALTA | `TopBar.tsx:58` | sim: marcar todas lidas em lote (só há `conversations/[id]/mark-read`) |
| Campo de busca 44px que abre a tela de busca | DIFERENTE | lupa 36px `SearchTrigger.tsx:43` abre diálogo `CommandPalette.tsx:58` | não |
| Chips roláveis Fila, Minhas, Todas, Com a IA, Sem próximo passo + chip de filtro com número | DIFERENTE | segmentado de 3 + "Mais" `AbasDaInbox.tsx:65-88`, `InboxFilters.tsx:20-38`; "Sem próximo passo" no popover `PopoverDeFiltros.tsx:102` | não |
| Linhas "Fechadas N" e "Arquivadas N" que abrem subtela com voltar | DIFERENTE | abas no "Mais" `InboxFilters.tsx:27-31` | não (`conversations/counts`) |
| Linha: avatar 52 + selo, nome 16, hora, prévia com tique e autor, silenciada, fixada, não lidas | DIFERENTE | avatar 40 `ConversationListItem.tsx:148,162`; autor `:219-227`; contador `:232` | não |
| Meta da linha: espera colorida, dono, etiqueta | OK | `item/MetaDaConversa.tsx` | não |
| Deslizar: direita Lida/Fixar, esquerda Mais/Arquivar | FALTA | só o "…" `ConversationListItem.tsx:257-262` | não (mark-read, mark-unread, pin, close existem) |
| FAB "Criar" | FALTA | nenhum | não |
| Aviso flutuante com Desfazer acima da barra | DIFERENTE | `avisarComDesfazer` existe; posição do sonner ignora barra `components/ui/sonner.tsx:20` | não |
| Vazio por filtro | OK | `EmptyPorFiltro.tsx`, `VazioDaAba.tsx` | não |
| Área segura (indicador do iPhone) | FALTA | sem `env(safe-area-inset-*)` em `app/globals.css` | não |

## 02 Conversa aberta

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Barra única: voltar, nome tocável abre a ficha, Ligar, ⋯ | DIFERENTE | duas barras empilhadas: a do celular `InboxLayout.tsx:494-519` e o cabeçalho desktop `:525`; Ligar `ConversationHeader.tsx:218` | não |
| Faixa do lead (etapa, funil, valor) que abre a folha Mover etapa | FALTA | etapas só no painel `painel/BarraDeEtapas.tsx:36` | não |
| Fio: dia, novas, sistema, passagem da IA, bolhas, citação, imagem, vídeo, áudio com transcrição, documento, contato, figurinha, apagada, falha | OK | `MessageBubble.tsx`, `bolha/`, `PassagemCard.tsx`, `media/AudioPlayer.tsx` | não |
| Nota interna com cor própria (`--note-bg`/`--note-ink`) | DIFERENTE | fundo de aviso tracejado `bolha/estilo.ts:51` | não |
| Avisos: conversa fechada + Reabrir; janela de 24h + Escolher modelo | OK | `JanelaFechadaAviso.tsx`, `composer/FaixaDeEstado.tsx` | não |
| Faixa de dono + "Assumir e responder" | OK | `composer/FaixaDoDono.tsx:158` | não |
| Composer: + anexar em blocos (Galeria, Câmera, Documento, Contato, Localização), caixa 44 com raio, respostas rápidas, enviar ou gravar 44 | DIFERENTE | anexar em dropdown `composer/BarraDoComposer.tsx:49`; texto 14px `Composer.tsx:307` (zoom no iPhone); respostas por "/" `composer/TemplateMenu.tsx` | sim: envio de localização |
| Folha de ações (Lead: mover, mudar funil, ganho, perdido; Conversa: transferir, fixar, silenciar, lida, arquivar, fechar) | DIFERENTE | dropdown `cabecalho/MaisAcoes.tsx:73`, `menu/MenuDaConversa.tsx` | não |
| Folha Transferir | DIFERENTE | popover `cabecalho/TransferirPopover.tsx:104` | não |
| Folha Marcar como perdido (chips de motivo + detalhe) | DIFERENTE | diálogo `kanban/LoseLeadDialog.tsx:18` | não |
| Composer acima da área segura, sem barra inferior | FALTA | sem área segura | não |

## 03 Ficha do lead

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Tela empilhada cheia (voltar + ⋯) | DIFERENTE | gaveta lateral 22rem até 90vw `InboxLayout.tsx:513` | não |
| Topo: avatar 84 + canal, nome 23, telefone, quem atende | DIFERENTE | cabeçalho compacto `painel/CabecalhoDoPainel.tsx` | não |
| Ações rápidas Conversa, Ligar, Tarefa (64px) | FALTA | nenhum | não |
| Próximo passo com Concluir e Reagendar; sem passo com "Criar próximo passo" | OK | `painel/ProximoPasso.tsx:157,182,208` | não |
| Negócio: funil, valor, etapa "x de y", Mover etapa, barra de etapas | DIFERENTE | barra clicável `painel/BarraDeEtapas.tsx`, sem folha | não |
| Abas Resumo, Negócios, Empresa, Atividade | OK | `painel/useAbaDoPainel.ts:5` | não |
| Conteúdo das abas (dados, etiquetas, observações, pedidos, empresa, linha do tempo) | OK | `painel/AbaResumo.tsx`, `painel/AbaNegocios.tsx:102`, `painel/AbaAtividade.tsx` | não |
| Alvos de 44px | DIFERENTE | botões de 22 e 24px `painel/CabecalhoDoPainel.tsx:112-131` | não |
| Folha de ações do lead | DIFERENTE | dropdown `painel/MenuDoLead.tsx` | não |

## 04 Folha de filtros

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Folha inferior (pegador, título, fechar, véu) | DIFERENTE | popover 288px `filtros/PopoverDeFiltros.tsx:68-90` | não |
| Interruptor "Só não lidas" | OK | `PopoverDeFiltros.tsx:93` | não |
| Canal: chips Todos, WhatsApp, Instagram | DIFERENTE | seletor por número `PopoverDeFiltros.tsx:120-139` | sim: filtro por tipo de canal |
| Quem atende: Todos, Você, Agente IA, Sem dono, pessoa | FALTA | só as abas | não (`assigned_to` em `conversations/route.ts:42`) |
| Rodapé Limpar + "Ver N conversas" | FALTA | nenhum | sim: `counts` só aceita canal (`counts/route.ts:60`) |
| Filtros a mais do CRM (sem próximo passo, só grupos, etiquetas, origem no Instagram) | OK | `PopoverDeFiltros.tsx:102-171`; ficam na folha | não |

## 05 Folha do botão criar

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| FAB 60px, raio 20, acima da barra, em Conversas, Funil e Tarefas | FALTA | nenhum | não |
| Folha "Criar" com itens por tela | FALTA | botões espalhados por página | não |
| Formulários (contato, lead, tarefa, compromisso) | DIFERENTE | diálogos centrados `contacts/NewContactDialog.tsx:103`, `kanban/NewLeadDialog.tsx`, `tasks/_components/FormularioDeTarefa.tsx` | não |
| Nova conversa por número ou contato | DIFERENTE | só pela tabela de contatos `contacts/ContactsTable.tsx` | não (`conversations/open-with-contact`) |

## 06 Funil

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Cabeçalho grande + buscar + ⋯ | FALTA | cabeçalho de página `pipelines/[id]/_client.tsx:137` | não |
| Seletor de funil em folha | DIFERENTE | lista em `/app/kanban` e quadro em `/app/pipelines/[id]`; nó de funis no menu `shell/NoDeFunis.tsx` | não |
| Resumo do funil (leads e valor) | DIFERENTE | total por coluna `kanban/StageColumn.tsx:60-67` | não |
| Abas de etapa roláveis com contador, uma etapa por vez | DIFERENTE | colunas de 320px lado a lado `KanbanBoard.tsx:66`, `StageColumn.tsx:138` | não |
| Cartão: nome, interesse, próximo passo, valor, dono, botão Mover | DIFERENTE | `KanbanCard.tsx`; mover é arrastar `StageColumn.tsx:211` (briga com a rolagem no toque) | não |
| Folha Mover etapa | DIFERENTE | `kanban/SeletorDeEtapa.tsx:72` | não |
| Vazio por etapa | OK | `StageColumn.tsx:242` | não |
| Ganho e perdido com motivo | OK | `KanbanCardActions.tsx:171`, `LoseLeadDialog.tsx:18` | não |

## 07 Tarefas

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Cabeçalho grande | FALTA | `tasks/_components/TarefasClient.tsx:72-73` | não |
| Segmentado Lista e Agenda | DIFERENTE | Lista e Calendário mensal `TarefasClient.tsx:113,127` | não |
| Chips Todas e Minhas com contador | FALTA | só seletor de situação `TarefasClient.tsx:84` | sim: `assigned_to` no GET `api/v1/tasks/route.ts:55-64` |
| Seções Atrasadas, Hoje, Esta semana… com contagem | OK | `ListaDeTarefas.tsx:186-193` | não |
| Cartão com check de 48px | DIFERENTE | check de 16px `ListaDeTarefas.tsx:81-87` | não |
| Agenda: faixa de 7 dias + compromissos do dia (tarefas e agendamentos juntos) | FALTA | mês só de tarefas `CalendarioDeTarefas.tsx:97`; agendamentos em `/app/agenda` | não (junta duas rotas) |

## 08 Avisos

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Aba "Avisos" com contador | FALTA | sino no topo `AlertsBell.tsx:51-82` | não |
| Tela cheia com cabeçalho grande e ⋯ (marcar todos resolvidos) | DIFERENTE | popover 396px `AlertsBell.tsx:78`; ação existe `CentralDeAvisos.tsx:122` | não |
| Abertos (N) e Resolvidos (N) | OK | `CentralDeAvisos.tsx:77,129-130` | não |
| Cartão com ações (primária, abrir conversa, Compareceu/Faltou/Remarcou, resolver, reabrir) | OK | `CentralDeAvisos.tsx`, `ResultadoDoCompromisso.tsx:54,63` | não |
| Desfazer no resolver todos | OK | `CentralDeAvisos.tsx:112` | não |

## 09 Mais

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Tela "Mais" com cabeçalho grande e busca no menu | FALTA | gaveta `MobileSidebar.tsx:39-45` | não |
| Cartão de perfil (nome, papel, editar) | DIFERENTE | dropdown `UserMenu.tsx` | não |
| Trocar organização em folha | DIFERENTE | `TenantSwitcher` no topo `TopBar.tsx:63-65` | não |
| Interruptor Disponível | FALTA | escondido abaixo de 640px: `hidden … sm:inline-flex` em `BotaoDeDisponibilidade.tsx:47` | não |
| Interruptor Tema escuro | DIFERENTE | dentro do menu do usuário `UserMenu.tsx:36` | não |
| Menu inteiro em grupos com ícone colorido, subtítulo, etiqueta, contador e ponto | DIFERENTE | `SidebarContent` com os grupos do catálogo `Sidebar.tsx:49,150-153`; sem subtítulo (o `description` existe no catálogo) | não |
| Atalhos: Pipeline vai para Funil, Tarefas e Agenda para Tarefas, Alertas para Avisos, Conexões para Canais | FALTA | nenhum | não |
| Sair da conta | OK | `UserMenu.tsx:90-92` | não |

## 10 Canais

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Tela empilhada com "‹ Mais", título grande e texto de entrada | FALTA | página com abas `/app/connections` | não |
| Cartão por canal: logo, status, aviso, Reconectar ou Ler QR, Gerenciar | DIFERENTE | abas por tipo com quebra `ConexoesShell.tsx:93-129`; reconectar `ConnectionsClient.tsx:223` | não |
| Saúde do canal | OK | `ConnectionHealthDot.tsx` | não |
| "Conectar outro canal" | DIFERENTE | uma aba por tipo, sem entrada única | não |
| Parear sem ler QR no mesmo aparelho (código) | OK | `PairingOptions.tsx` | não |

## 11 Busca aberta

| Elemento | Status | Evidência hoje | Backend |
|---|---|---|---|
| Tela cheia empilhada, voltar, campo 44 focado com limpar | DIFERENTE | diálogo a 12vh `CommandPalette.tsx:57-58` | não |
| Buscas recentes (termos) | DIFERENTE | "Recentes" são contatos `CommandPalette.tsx:235` | não (localStorage) |
| Resultados em grupos com o tipo | OK | `CommandPalette.tsx:234-236` | não |
| Campo de 16px | OK | `CommandPalette.tsx:282` (`text-base`) | não |
| "Nada encontrado" com dica | OK | `CommandPalette.tsx:298` | não |

## Base do app (transversal)

| Item | Status | Evidência hoje |
|---|---|---|
| Manifesto: nome, standalone, `start_url`, ícones 192/512 | DIFERENTE | `app/manifest.ts:15-24`; faltam `theme_color`, `background_color`, `orientation`, ícone `maskable` |
| Service worker do app (instalação, falha de rede) | FALTA | só `public/notify-sw.js` para notificação, registrado em `lib/notifications/service_worker.ts:5` |
| `viewport-fit=cover` | FALTA | `app/layout.tsx:128-130` só tem `themeColor` |
| Área segura | FALTA | nenhum `env(safe-area-inset-*)` |
| Navegação empilhada com voltar (e o gesto de voltar do aparelho) | FALTA | cada tela é rota solta; a Inbox usa estado `InboxLayout.tsx:494` |
| Corte em 760px | DIFERENTE | o CRM usa `md` = 768px (`InboxLayout.tsx:61-62`, `AppShell.tsx:81`); só existe `@custom-variant dark` (`globals.css:31`) |
| Folha inferior | DIFERENTE | `components/ui/sheet.tsx:40-41` tem lado `bottom`, sem pegador, raio 24, altura 88% e área segura |
| Campos de 16px | DIFERENTE | `input.tsx:14-15`, `select.tsx:22`, `textarea.tsx`, `Composer.tsx:307` em 14px |
| Alvo de 44px nos botões | OK | `button.tsx:62-69` (`h-11` abaixo de `lg`) |
| Alvo de 44px na casca | DIFERENTE | lupa `SearchTrigger.tsx:43` (`h-9 w-9`) |
| Escuro = pele Verdash, claro = marca do revendedor | OK | conferido pela paridade desktop (`tests/unit/paridade-com-o-prototipo.test.ts`) |
| Cores do celular | DIFERENTE | no claro, `--info`, `--ink-3`, `--ok` e `--warn` do protótipo mobile diferem do desktop; faltam `--bar`, `--note-bg`, `--note-ink` (ver o teste) |

**Decisão pendente para o Peterson:** as quatro cores claras acima são tokens compartilhados com o desktop. Se o
CRM adotar o valor do mobile, a paridade desktop reprova (e vice-versa). Opções: (a) atualizar o protótipo desktop
para os valores do mobile; (b) registrar exceção em `EXCECOES` do teste mobile.

## As 63 telas do catálogo

O escopo é o CRM inteiro. O tratamento de cada destino de `lib/navigation/catalogo.ts` (lista em cartão, tabela
empilhada, formulário em tela cheia, segmentado, consulta) e o PR em que ele entra estão em
**`auditoria-mobile-catalogo.md`** (parte 2, separada para cada arquivo ficar abaixo de 300 linhas).

## Teste de paridade mobile

`tests/unit/paridade-mobile.test.ts` lê o protótipo (tokens dos dois temas, barra inferior, cabeçalho grande,
linha da lista, folha inferior, FAB, área segura, alvos de 44px, campos de 16px) e compara com o CRM pelo contrato
`tests/unit/paridade-mobile/contrato.ts` (tokens `--mb-*` no `:root`, `@custom-variant mb`, peças em
`components/mobile/`, um arquivo por tela). Hoje roda em modo **relatório**: imprime as 70 divergências e só reprova
se o leitor do protótipo quebrar. Modo **estrito**, critério de pronto da M5:
`PARIDADE_MOBILE_ESTRITA=1 pnpm vitest run tests/unit/paridade-mobile.test.ts`. Controle negativo em
`tests/unit/paridade-mobile-controle-negativo.test.ts`.

## Plano de implementação (M1 a M5)

Pronto de cada PR: o grupo dele no teste zera no modo estrito, revisão do @Cassio_SecRev, e desktop e tablet sem
mudança (tudo atrás do corte `mb:`, abaixo de 760px).

| PR | Escopo | Arquivos (estim.) | Backend |
|---|---|---|---|
| **M1.1** Corte e tokens | `@custom-variant mb`, tokens `--mb-*` e cores do celular no `globals.css`, `viewportFit: "cover"`, área segura, campos de 16px, lupa de 44px | 7 | não |
| **M1.2** PWA | manifesto completo (cores, orientação, ícone maskable na rota `app-icon`), service worker do app junto com o de notificação, convite para instalar | 6 | não |
| **M1.3** Casca do app | casca do celular sem TopBar e sem gaveta, `BarraInferior` com contadores, `CabecalhoGrande`, `BarraDeTela` com voltar pela pilha do roteador, `BotaoCriar` por rota, aviso acima da barra | 10 | não |
| **M1.4** Folha e gesto | `FolhaInferior` (pegador, arrastar para fechar, foco preso, área segura), `LinhaDeslizante` (ações também no ⋯ para teclado e leitor de tela), popover e dropdown viram folha abaixo de 760 | 8 | não |
| **M2.1** Lista de conversas | cabeçalho, busca, chips, Fechadas e Arquivadas, `LinhaDaConversa`, gestos, folha da lista | 10 | sim: marcar todas como lidas em lote |
| **M2.2** Folha de filtros | canal por tipo, quem atende, só não lidas, extras, "Ver N conversas" | 5 | sim: tipo de canal na lista; contagem com todos os filtros |
| **M2.3** Conversa aberta | barra única, faixa do lead + folha Mover etapa, composer de 16px, anexos em blocos, folhas de ações, Transferir e Perdido | 12 | sim, se mantida: envio de localização |
| **M2.4** Ficha do lead | tela empilhada: topo, ações rápidas, próximo passo, negócio, abas, alvos de 44px | 8 | não |
| **M3.1** Funil | seletor em folha, resumo, abas de etapa, cartão com Mover, ganho e perdido | 8 | não (avaliar rota de totais acima de 1.000 leads) |
| **M3.2** Tarefas | Lista (Todas e Minhas, check de 48px) e Agenda semanal com tarefas e agendamentos | 8 | sim: `assigned_to` no `GET /api/v1/tasks` |
| **M3.3** Avisos | tela e aba com contador; sino só no desktop | 4 | não |
| **M4.1** Mais e Canais | perfil, organização, Disponível, tema, menu do catálogo com subtítulo, contador e etiqueta, atalhos, sair; Canais em cartões | 8 | não |
| **M4.2** Padrões | `TabelaEmpilhada`, `TelaDeFormulario`, grade de 1 coluna, aviso de Consulta | 6 | não |
| **M4.3** CRM e Atendimento | 12 telas (catálogo 1, 3, 5, 7-10, 12-15, 19) | 14 | não |
| **M4.4** Agente de IA | 14 telas (catálogo 22-36, menos 32) | 14 | não |
| **M4.5** Análise | 7 telas (catálogo 40-46) | 10 | não |
| **M4.6** Ajustes e integrações | 24 telas (catálogo 16-18, 20, 21, 38, 39, 47-63) | 16 | não |
| **M4.7** Telas de detalhe | contato, agente e demais rotas `[id]` fora do catálogo | 8 | não |
| **M5.1** Busca e acabamento | busca em tela cheia com buscas recentes, movimento com `prefers-reduced-motion`, vazios, Playwright em 390x844 nas 11 telas | 8 | não |
| **M5.2** Paridade estrita | `ESTRITO` fixo em `true`; exceções aceitas pelo Peterson em `EXCECOES` | 2 | não |

Total: 20 PRs, cerca de 172 arquivos. Backend em 4 PRs (M2.1, M2.2, M2.3 se houver localização, M3.2), todos
pequenos: um parâmetro ou uma rota em lote, sem migração.

Manutenção: o contrato concentra onde cada peça mora e as medidas saem do protótipo para tokens `--mb-*`. Versão
nova do protótipo aprovada = trocar o `.dc.html`, e o teste aponta o que mudou. O risco é manter duas cascas; por
isso as telas do celular usam os mesmos hooks e rotas e só trocam a apresentação, e a casca decide pelo corte de
CSS `mb:`, sem `useMediaQuery`, para não piscar na hidratação (o mesmo motivo de `InboxLayout.tsx:445`).
