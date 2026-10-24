---
impacto: capacidade_nova
secao: adicionado
titulo: Conectar com Meta por login, sem copiar token
---

Em Configurações › Meta Ads há um botão "Conectar com Meta": você entra com a sua
conta, autoriza a leitura dos anúncios e o sistema guarda a conexão por cerca de
60 dias, avisando antes de vencer. O token colado à mão continua funcionando.

Para ligar na sua instalação: configure `META_ADS_OAUTH_APP_ID` e
`META_ADS_OAUTH_APP_SECRET` com os dados do seu app Meta, e cadastre
`<endereço do sistema>/api/v1/plataformas-de-anuncio/meta/callback` em "URIs de
redirecionamento OAuth válidos" do app. Sem isso o botão não aparece.
