/**
 * SSRF: o IP julgado pelo NÚMERO, e a conexão no IP conferido (P2-1 e P2-2 do
 * @Cassio_SecRev na #79).
 *
 *  - toda grafia de uma faixa proibida é recusada: IPv4-mapeado em hexadecimal,
 *    IPv4-compatível, NAT64, 6to4 para privado, Teredo, ULA, link-local fora de
 *    `fe80`, multicast, broadcast, CGNAT, 0/8, 192.0.0/24, 198.18/15…;
 *  - DNS rebinding: a conferência vê IP público, a conexão veria IP interno —
 *    `fetchComDestinoFixado` conecta no endereço que a PRÓPRIA conferência
 *    devolveu, então o interno é recusado e o servidor interno não recebe nada;
 *  - porta fora da lista é recusada.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchComDestinoFixado, ipEhEspecial } from "@/lib/automation/outbound-ip";
import { baixarMidiaDaMeta, hostDaMetaPermitido } from "@/lib/messaging/media/baixar-midia-da-meta";

describe("ipEhEspecial — a faixa pelo número, qualquer que seja a grafia", () => {
  it.each([
    // IPv4
    ["0.0.0.0/8", "0.1.2.3"],
    ["10/8", "10.0.1.1"],
    ["CGNAT 100.64/10", "100.127.255.254"],
    ["loopback", "127.0.0.1"],
    ["metadata", "169.254.169.254"],
    ["172.16/12", "172.20.0.5"],
    ["192.0.0.0/24", "192.0.0.170"],
    ["192.168/16", "192.168.1.1"],
    ["benchmark 198.18/15", "198.19.255.1"],
    ["multicast", "239.255.255.250"],
    ["broadcast", "255.255.255.255"],
    // IPv4 escondido em IPv6
    ["IPv4-mapeado pontuado", "::ffff:127.0.0.1"],
    ["IPv4-mapeado em HEXADECIMAL", "::ffff:7f00:1"],
    ["IPv4-mapeado hex para 10.0.1.1", "::ffff:a00:101"],
    ["IPv4-mapeado por extenso", "0:0:0:0:0:ffff:7f00:0001"],
    ["IPv4-compatível pontuado", "::127.0.0.1"],
    ["IPv4-compatível hex (metadata)", "::a9fe:a9fe"],
    ["6to4 para 10.0.1.1", "2002:a00:101::1"],
    ["6to4 para 169.254.169.254", "2002:a9fe:a9fe::"],
    // IPv6
    ["::", "::"],
    ["::1", "::1"],
    ["::1 por extenso", "0:0:0:0:0:0:0:1"],
    ["NAT64 64:ff9b::/96", "64:ff9b::808:808"],
    ["NAT64 local 64:ff9b:1::/48", "64:ff9b:1::a00:1"],
    ["Teredo 2001::/32", "2001:0:4136:e378::1"],
    ["documentação", "2001:db8::1"],
    ["ULA fc00::/7 (fd)", "fd12:3456::1"],
    ["link-local fora de fe80", "fe9f::1"],
    ["link-local com zona", "fe80::1%eth0"],
    ["site-local fec0::/10", "fec0::1"],
    ["multicast ff00::/8", "ff02::1"],
    ["discard 100::/64", "100::1"],
    ["lixo", "não-é-ip"],
    ["IPv6 malformado", "1:2:3:4:5:6:7:8:9"],
  ])("recusa %s (%s)", (_r, ip) => {
    expect(ipEhEspecial(ip)).toBe(true);
  });

  it.each([
    ["IPv4 público", "8.8.8.8"],
    ["logo acima da CGNAT", "100.128.0.1"],
    ["logo acima da 198.18/15", "198.20.0.1"],
    ["IPv6 público", "2606:4700:4700::1111"],
    ["IPv4-mapeado público", "::ffff:808:808"],
    ["6to4 para público", "2002:808:808::1"],
  ])("CONTROLE: aceita %s (%s)", (_r, ip) => {
    expect(ipEhEspecial(ip)).toBe(false);
  });
});

describe("DNS rebinding: a conexão vai no IP que a conferência devolveu", () => {
  let servidor: Server;
  let porta = 0;
  let recebidos: Array<{ host: string | undefined; corpo: string }> = [];

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        recebidos.push({ host: req.headers.host, corpo });
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("dentro da rede");
      });
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    porta = (servidor.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

  it("conferência vê público, conexão veria 127.0.0.1: RECUSADO, e o interno não recebe nada", async () => {
    recebidos = [];
    // O DNS do atacante, TTL zero: 1ª resposta pública (a da conferência
    // antiga), 2ª interna (a do fetch). O fixado só resolve UMA vez — no lookup
    // da conexão — e é ESSA resposta que ele julga e usa.
    const respostas = [[{ address: "93.184.216.34", family: 4 }], [{ address: "127.0.0.1", family: 4 }]];
    const resolver = async () => respostas.shift() ?? [];
    await resolver(); // a conferência que roda antes (vê o público)
    await expect(
      fetchComDestinoFixado(`http://rebind.atacante.teste:${porta}/`, { method: "POST", body: "x" }, { resolver }),
    ).rejects.toThrow(/private_ip/);
    expect(recebidos).toEqual([]);
  });

  it("resposta MISTA (público + interno) é recusada: não há como saber qual o socket pegaria", async () => {
    recebidos = [];
    const resolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await expect(fetchComDestinoFixado(`http://misto.teste:${porta}/`, {}, { resolver })).rejects.toThrow(/private_ip/);
    expect(recebidos).toEqual([]);
  });

  it("literal de IP interno na URL é recusado antes de conectar", async () => {
    await expect(fetchComDestinoFixado(`http://127.0.0.1:${porta}/`)).rejects.toThrow(/private_ip/);
    await expect(fetchComDestinoFixado(`http://[::ffff:7f00:1]:${porta}/`)).rejects.toThrow(/private_ip/);
  });

  it("CONTROLE: com o juiz liberando, conecta no IP RESOLVIDO e mantém o Host do nome", async () => {
    recebidos = [];
    const resolver = async () => [{ address: "127.0.0.1", family: 4 }];
    const res = await fetchComDestinoFixado(
      `http://cliente.exemplo.teste:${porta}/gancho`,
      { method: "POST", body: "corpo-do-webhook" },
      { resolver, ipProibido: () => false },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("dentro da rede");
    expect(recebidos).toEqual([{ host: `cliente.exemplo.teste:${porta}`, corpo: "corpo-do-webhook" }]);
  });

  it("porta fora da lista é recusada", async () => {
    await expect(
      fetchComDestinoFixado("https://lookaside.fbsbx.com:8443/x", {}, { portasPermitidas: [443] }),
    ).rejects.toThrow(/port_8443/);
  });
});

describe("mídia da Meta: só a porta 443", () => {
  it("host da Meta em porta fora de 443 não passa na allowlist nem no download", async () => {
    expect(hostDaMetaPermitido(new URL("https://lookaside.fbsbx.com:8443/x"))).toBe(false);
    expect(hostDaMetaPermitido(new URL("https://lookaside.fbsbx.com:443/x"))).toBe(true);
    await expect(
      baixarMidiaDaMeta("https://lookaside.fbsbx.com:8443/x", { conferirDestino: async () => {} }),
    ).rejects.toThrow(/host_not_allowed/);
  });
});
