# Compressão do JS: quem comprime, e por que o navegador recebe gzip

Medido em 05/10/2026 contra `https://crm.verdash.com.br`, no maior chunk do
`/login` (`/_next/static/chunks/1r2ldcin9_scl.js`, 391.592 bytes crus):

| `Accept-Encoding` pedido | resposta | bytes |
|---|---|---|
| `gzip, deflate, br, zstd` (o que o Chrome manda) | `gzip` | 91.132 |
| `gzip` | `gzip` | 91.132 |
| `br` (só br) | `br` | 89.262 |

```bash
curl -s -o /dev/null -w "%{size_download}\n" -D - \
  -H "Accept-Encoding: gzip, deflate, br, zstd" \
  https://crm.verdash.com.br/_next/static/chunks/<chunk>.js | grep -i content-encoding
```

## Quem faz o quê

- **Next (`next start`)**: `compress` é o padrão (`true`) e o Next só sabe gzip.
  Toda resposta sai da origem já com `Content-Encoding: gzip`.
- **Traefik**: o middleware `deskcomm-compress` (`docker-compose.traefik.yml`)
  sabe br, mas não recomprime o que já chega comprimido. Na prática fica inerte.
- **Cloudflare**: guarda no cache a variante gzip que a origem mandou e a entrega
  a quem aceita gzip, o que inclui todo navegador. Só converte para br/zstd
  quando o cliente NÃO aceita gzip (o `curl -H "Accept-Encoding: br"` acima).

Ou seja, a Cloudflare comprime com br, mas o navegador não recebe br: recebe o
gzip do Next.

## Vale mudar?

O ganho medido é pequeno: 89.262 contra 91.132 bytes (−2%) no maior chunk, e os
chunks são `immutable` (baixados uma vez por versão). O caminho, se um dia
compensar: `compress: false` no `next.config.ts`. Aí a origem manda o JS cru,
o Traefik (ou a Cloudflare) escolhe br/zstd, e o cache da Cloudflare passa a
ter a variante certa. Antes de ligar, confirmar que o `compress` do Traefik não
bufferiza as respostas em streaming (RSC e SSE): ele exclui `text/event-stream`
por padrão, mas o RSC sai como `text/x-component`.

Não foi feito na auditoria de desempenho (item 15). Este arquivo registra a
medição para ninguém repetir a investigação.
