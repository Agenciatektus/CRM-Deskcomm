# Fotos e histórico do canal pareado

Destino: núcleo. Corrige comportamento comum do inbox e do cron existente; não acrescenta configuração ou extensão.

Publicar primeiro no Verdash: `crm-foto-perfil`, `instagram-webhook-receiver` e `crm-reenviar-webhook` com os helpers atualizados. Depois publicar o CRM. A função nova usa autenticação própria por `x-crm-token` e `verify_jwt = false`, como as irmãs de pareamento.

A entrada é o webhook assinado do Verdash; `lerEventoDoInstagram` escolhe o destinatário no eco, e `ingest.ts` grava saída no histórico. O inbox existente mostra a bolha de saída; a chave `(organization_id, external_id)` evita duplicação. Saída externa pausa a IA por `pausarIaPorAtendimentoManual`; não chama `aplicarEfeitosPosEntrada` nem abre demanda inbound.

O cron `contact-avatars` resolve a sessão pela conversa do contato, busca a foto pelo adapter e mantém o arquivo no bucket privado. O guard de anonimização e a fila de redação continuam protegendo corridas durante o download. Não há configuração nova: usa a conexão já pareada na tela de canais. Falha transitória do provider aparece no log do cron e volta a ser tentada.

Fotos antes marcadas como ausentes podem aguardar a janela existente de sete dias. Para antecipar, após publicar as duas pontas, zerar `avatar_updated_at` **somente** nos contatos sem `avatar_storage_path` da organização afetada, preservando `is_anonymized = false`, e executar o cron autenticado. Conferir `scanned`, `updated`, `no_picture` e `failed` e abrir o inbox da organização.

Mensagens enviadas que o Verdash descartou antes desta correção não aparecem retroativamente: o eco não era registrado. Validar com uma nova resposta pelo aplicativo do Instagram, conferir direção, contato e ausência de duplicata. Prova de tela e produção permanece pendente até o deploy.
