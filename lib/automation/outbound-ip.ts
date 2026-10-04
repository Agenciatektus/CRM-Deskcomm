/**
 * Faixas de IP que um webhook de saída nunca deve alcançar, e o guard que
 * RESOLVE o hostname antes de decidir.
 *
 * O guard textual (`assertSafeOutboundUrl`) declarava a própria dívida: um
 * hostname público que resolve para IP privado no momento do fetch passava
 * batido. Numa VPS de self-host isso alcança o que mora na rede do compose —
 * o cache e o gateway de mensageria sem autenticação de rede, o Postgres, e o serviço de
 * metadados da nuvem em 169.254.169.254, que entrega credencial de instância.
 *
 * Quem cadastra a URL precisa ser `manager+`, então o atacante já é alguém de
 * dentro do tenant; o que se impede aqui é a escalada de "posso configurar um
 * webhook" para "posso varrer e falar com a rede interna do servidor".
 */
import { lookup } from "node:dns/promises";
import { request as requestHttp, type IncomingMessage } from "node:http";
import { request as requestHttps } from "node:https";
import { isIP, isIPv4, isIPv6, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

/** Converte IPv4 pontuado em inteiro de 32 bits. */
function ipv4ParaInt(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let total = 0;
  for (const parte of partes) {
    const n = Number(parte);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    total = total * 256 + n;
  }
  return total;
}

/** [base, prefixo] das faixas IPv4 que não podem ser destino. */
const FAIXAS_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "este host"
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT — ausente do guard textual
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — inclui o metadata de nuvem
  ["172.16.0.0", 12], // privada (a rede default do Docker mora aqui)
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada (inclui 255.255.255.255)
];

/**
 * IPv6 → inteiro de 128 bits, pela gramática toda: `::` em qualquer posição,
 * grupos hexadecimais, IPv4 pontuado no fim (`::ffff:1.2.3.4`, `::1.2.3.4`) e
 * zona (`fe80::1%eth0`, descartada). `null` = não é IPv6 válido.
 *
 * A versão anterior comparava TEXTO (`startsWith("fe80")`, regex do
 * `::ffff:a.b.c.d`) e deixava passar a mesma faixa escrita de outro jeito:
 * `::ffff:7f00:1` é 127.0.0.1 em hexadecimal, `::127.0.0.1` é o IPv4-compatível,
 * `fe9f::1` é link-local sem começar com `fe80`. Pelo número, forma não importa.
 */
function ipv6ParaBigInt(entrada: string): bigint | null {
  let ip = entrada.toLowerCase();
  const zona = ip.indexOf("%");
  if (zona >= 0) ip = ip.slice(0, zona);
  if (!isIPv6(ip)) return null;

  let ipv4Final: number | null = null;
  const ultimoDoisPontos = ip.lastIndexOf(":");
  const cauda = ip.slice(ultimoDoisPontos + 1);
  if (cauda.includes(".")) {
    ipv4Final = ipv4ParaInt(cauda);
    if (ipv4Final === null) return null;
    ip = `${ip.slice(0, ultimoDoisPontos + 1)}${(ipv4Final >>> 16).toString(16)}:${(ipv4Final & 0xffff).toString(16)}`;
  }

  const [esquerda, direita] = ip.includes("::") ? ip.split("::") : [ip, null];
  const gruposE = esquerda ? esquerda.split(":") : [];
  const gruposD = direita === null ? [] : direita ? direita.split(":") : [];
  const faltam = 8 - gruposE.length - gruposD.length;
  if (direita === null ? faltam !== 0 : faltam < 1) return null;
  const grupos = [...gruposE, ...Array<string>(direita === null ? 0 : faltam).fill("0"), ...gruposD];
  let total = 0n;
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    total = (total << 16n) | BigInt(parseInt(g, 16));
  }
  return total;
}

function prefixoV6(alvo: bigint, base: string, bits: number): boolean {
  const b = ipv6ParaBigInt(base);
  if (b === null) return false;
  const deslocamento = BigInt(128 - bits);
  return alvo >> deslocamento === b >> deslocamento;
}

/** Os 32 bits menos significativos, como IPv4 pontuado. */
function ipv4DosBits(v: bigint): string {
  const n = Number(v & 0xffffffffn);
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** Faixas IPv6 que nunca são destino — não carregam IPv4 que se possa julgar. */
const FAIXAS_IPV6: ReadonlyArray<readonly [string, number]> = [
  ["::", 128], // não especificado
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64 bem-conhecido — tradutor para IPv4, inclusive privado
  ["64:ff9b:1::", 48], // NAT64 de uso local
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo — IPv4 ofuscado, atravessa NAT
  ["2001:db8::", 32], // documentação
  ["fc00::", 7], // ULA
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (obsoleto, ainda roteado em rede interna)
  ["ff00::", 8], // multicast
];

export function ipEhEspecial(ip: string): boolean {
  if (isIPv4(ip)) {
    const alvo = ipv4ParaInt(ip);
    if (alvo === null) return true; // não parseou: trata como perigoso
    for (const [base, prefixo] of FAIXAS_IPV4) {
      const baseInt = ipv4ParaInt(base);
      if (baseInt === null) continue;
      const mascara = prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
      if ((alvo & mascara) >>> 0 === (baseInt & mascara) >>> 0) return true;
    }
    return false;
  }

  const v6 = ipv6ParaBigInt(ip);
  if (v6 === null) return true; // nem IPv4 nem IPv6: não é destino que se saiba julgar

  // IPv4 ESCONDIDO em IPv6: decide pelo IPv4 de dentro, qualquer que seja a grafia.
  //   ::ffff:0:0/96 (mapeado, em pontuado OU hexadecimal)
  //   ::/96 (compatível, obsoleto — `::127.0.0.1`)
  if (prefixoV6(v6, "::ffff:0:0", 96)) return ipEhEspecial(ipv4DosBits(v6));
  if (prefixoV6(v6, "::", 96) && v6 > 1n) return ipEhEspecial(ipv4DosBits(v6));
  // 6to4 (2002::/16): o IPv4 do túnel está nos bits 16–47. Apontando para faixa
  // privada, o roteador 6to4 entrega dentro da rede.
  if (prefixoV6(v6, "2002::", 16)) return ipEhEspecial(ipv4DosBits(v6 >> 80n));

  for (const [base, bits] of FAIXAS_IPV6) {
    if (prefixoV6(v6, base, bits)) return true;
  }
  return false;
}

/**
 * Resolve o hostname e devolve os endereços, recusando se QUALQUER um cair em
 * faixa especial.
 *
 * Recusar quando *qualquer* endereço é especial (e não "quando todos são") é
 * deliberado: um domínio que devolve dois registros, um público e um privado,
 * é a assinatura do rebinding — o `fetch` pode escolher o privado, e não temos
 * como saber qual ele pegou.
 *
 * Sozinho, isto NÃO fecha o rebinding: entre esta resolução e a do `fetch` o
 * DNS pode mudar de resposta. Quem fecha é `fetchComDestinoFixado`, abaixo:
 * a conexão usa o endereço que a PRÓPRIA conferência devolveu. Esta função
 * fica como recusa rápida (antes de montar corpo, assinatura, retentativas).
 */
export async function assertDestinoResolvidoSeguro(hostname: string): Promise<void> {
  // Literal de IP não passa por DNS: julga direto.
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (ipEhEspecial(hostname)) throw new Error("unsafe_url:private_ip");
    return;
  }

  let enderecos: Array<{ address: string }>;
  try {
    enderecos = await lookup(hostname, { all: true });
  } catch {
    // Não resolveu: recusa. Falhar fechado aqui custa uma entrega de webhook;
    // falhar aberto custa a rede interna.
    throw new Error("unsafe_url:dns_failed");
  }

  if (enderecos.length === 0) throw new Error("unsafe_url:dns_empty");
  for (const { address } of enderecos) {
    if (ipEhEspecial(address)) throw new Error("unsafe_url:private_ip");
  }
}

type Endereco = { address: string; family: number };

export interface OpcoesDoDestinoFixado {
  /** Só para teste: a resolução de nome (padrão: `dns.lookup` com `all`). */
  resolver?: (hostname: string) => Promise<Endereco[]>;
  /** Só para teste: quem decide se o IP é proibido (padrão: `ipEhEspecial`). */
  ipProibido?: (ip: string) => boolean;
  /** Portas aceitas; ausente = qualquer uma. */
  portasPermitidas?: readonly number[];
}

export interface PedidoFixado {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}

/**
 * `fetch` que CONECTA no endereço que acabou de ser conferido — fecha o TOCTOU
 * de DNS (P2-1 do @Cassio_SecRev na #79).
 *
 * Conferir o nome e depois chamar `fetch(url)` resolve o nome DUAS vezes: um
 * domínio do atacante com TTL zero responde público na conferência e
 * `127.0.0.1`/`10.0.1.1`/`169.254.169.254` na conexão (DNS rebinding). Aqui a
 * resolução acontece UMA vez, dentro do `lookup` da própria conexão: o que é
 * conferido é exatamente o que é conectado. Qualquer endereço proibido na
 * resposta recusa (a assinatura do rebinding é misturar público e privado).
 *
 * O `Host` e o SNI continuam sendo o nome da URL (o `lookup` só troca o
 * endereço do socket), então TLS e virtual host funcionam como antes. Não segue
 * redirecionamento: 3xx volta para quem chamou decidir.
 */
export async function fetchComDestinoFixado(
  urlBruta: string,
  pedido: PedidoFixado = {},
  opcoes: OpcoesDoDestinoFixado = {},
): Promise<Response> {
  const url = new URL(urlBruta);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsafe_url:scheme");
  const proibido = opcoes.ipProibido ?? ipEhEspecial;
  const resolver = opcoes.resolver ?? ((h: string) => lookup(h, { all: true }) as Promise<Endereco[]>);
  const porta = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  if (opcoes.portasPermitidas && !opcoes.portasPermitidas.includes(porta)) {
    throw new Error(`unsafe_url:port_${porta}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Literal de IP não passa pelo `lookup`: julga aqui.
  if (isIP(host) && proibido(host)) throw new Error("unsafe_url:private_ip");

  const lookupFixado: LookupFunction = (hostname, options, callback) => {
    resolver(hostname).then(
      (enderecos) => {
        if (enderecos.length === 0) return callback(new Error("unsafe_url:dns_empty"), "", 4);
        if (enderecos.some((e) => proibido(e.address))) {
          return callback(new Error("unsafe_url:private_ip"), "", 4);
        }
        if ((options as { all?: boolean }).all) {
          return (callback as unknown as (e: Error | null, a: Endereco[]) => void)(null, enderecos);
        }
        callback(null, enderecos[0]!.address, enderecos[0]!.family);
      },
      () => callback(new Error("unsafe_url:dns_failed"), "", 4),
    );
  };

  const fazer = url.protocol === "https:" ? requestHttps : requestHttp;
  return new Promise<Response>((resolve, reject) => {
    const req = fazer(
      url,
      { method: pedido.method ?? "GET", headers: pedido.headers, lookup: lookupFixado, signal: pedido.signal },
      (res: IncomingMessage) => {
        const headers = new Headers();
        for (const [nome, valor] of Object.entries(res.headers)) {
          if (Array.isArray(valor)) for (const v of valor) headers.append(nome, v);
          else if (valor !== undefined) headers.set(nome, String(valor));
        }
        const status = res.statusCode ?? 502;
        const semCorpo = [204, 205, 304].includes(status) || (pedido.method ?? "GET") === "HEAD";
        if (semCorpo) res.resume();
        resolve(
          new Response(semCorpo ? null : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>), {
            status,
            statusText: res.statusMessage,
            headers,
          }),
        );
      },
    );
    req.on("error", reject);
    if (pedido.body !== undefined) req.write(pedido.body);
    req.end();
  });
}
