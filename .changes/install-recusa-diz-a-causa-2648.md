---
impacto: nada_mudou
secao: corrigido
titulo: A instalação nova diz por que não construiu o CRM na VPS, em vez de culpar sempre o registro de imagens
---

Quando a instalação nova se recusava a construir o CRM na própria VPS, a mensagem dizia sempre que o registro de imagens não tinha respondido, mesmo quando a causa era outra. Agora ela separa três casos: se falta o componente de construção do Docker (buildx), ela diz isso e manda instalar o pacote que esta VPS tem (`docker-buildx` no Ubuntu, `docker-buildx-plugin` com o repositório oficial do Docker); se o registro não respondeu, pede para rodar o instalador de novo em alguns minutos; e, se a própria pessoa desligou a construção com `DESKCOMM_BUILD_LOCAL=0`, ela diz que foi isso. Quem já tem o CRM instalado não precisa fazer nada ao atualizar.

Contribuição de @webtecnica (#2693, fecha #2648).
