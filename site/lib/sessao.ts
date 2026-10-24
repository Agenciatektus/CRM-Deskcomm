/**
 * Decide se o visitante parece ter uma sessão VIVA no CRM, só pelo cookie (sem validar assinatura:
 * é uma dica de roteamento, e o `proxy.ts` do CRM valida de verdade em `/app`).
 *
 * Antes bastava o cookie existir, e um cookie antigo mandava o visitante da LP para `/app` e dali
 * para `/login`. Agora o cookie precisa trazer uma sessão cujo `expires_at` ainda não passou.
 * Qualquer dúvida (formato desconhecido, JSON inválido) vale como "sem sessão": a LP aparece.
 */
const NOME = "sb-deskcomm-auth";

type Cookie = { name: string; value: string };

function juntarPedacos(cookies: readonly Cookie[]): string | null {
  const inteiro = cookies.find((c) => c.name === NOME);
  if (inteiro) return inteiro.value;
  const pedacos = cookies
    .map((c) => ({ c, m: c.name.match(new RegExp(`^${NOME}\\.(\\d+)$`)) }))
    .filter((x): x is { c: Cookie; m: RegExpMatchArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
  return pedacos.length ? pedacos.map((x) => x.c.value).join("") : null;
}

export function temSessaoViva(cookies: readonly Cookie[], agoraMs: number = Date.now()): boolean {
  const bruto = juntarPedacos(cookies);
  if (!bruto) return false;
  try {
    const texto = bruto.startsWith("base64-")
      ? Buffer.from(bruto.slice(7), "base64url").toString("utf8")
      : decodeURIComponent(bruto);
    const sessao = JSON.parse(texto) as { expires_at?: unknown };
    return typeof sessao.expires_at === "number" && sessao.expires_at * 1000 > agoraMs;
  } catch {
    return false;
  }
}
