/**
 * Decide se o visitante parece ter uma sessão VIVA no CRM, só pelo cookie (sem validar assinatura:
 * é uma dica de roteamento, e o `proxy.ts` do CRM valida de verdade em `/app`).
 *
 * Antes bastava o cookie existir, e um cookie antigo mandava o visitante da LP para `/app` e dali
 * para `/login`. Agora o cookie precisa trazer uma sessão recente (ver a folga abaixo).
 * Qualquer dúvida (formato desconhecido, JSON inválido) vale como "sem sessão": a LP aparece.
 */
const NOME = "sb-deskcomm-auth";
const PEDACO = /^sb-deskcomm-auth\.(\d+)$/;

/**
 * O `expires_at` do cookie é a validade do access token (cerca de 1 h); o `proxy.ts` do CRM o renova
 * com o refresh token. Quem volta horas depois ainda deve entrar direto, então há uma folga: só
 * cookie vencido há mais de 7 dias (o caso de sessão abandonada, que terminava em `/login`) deixa
 * a LP aparecer.
 */
const FOLGA_MS = 7 * 24 * 60 * 60 * 1000;

type Cookie = { name: string; value: string };

/** Como o `@supabase/ssr`: `.0`, `.1`, ... até o primeiro que faltar. */
function juntarPedacos(cookies: readonly Cookie[]): string | null {
  const inteiro = cookies.find((c) => c.name === NOME);
  if (inteiro) return inteiro.value;
  const porIndice = new Map<number, string>();
  for (const c of cookies) {
    const m = c.name.match(PEDACO);
    if (m) porIndice.set(Number(m[1]), c.value);
  }
  let junto = "";
  for (let i = 0; porIndice.has(i); i++) junto += porIndice.get(i);
  return junto || null;
}

function lerJson(bruto: string): unknown {
  if (bruto.startsWith("base64-")) return JSON.parse(Buffer.from(bruto.slice(7), "base64url").toString("utf8"));
  try {
    return JSON.parse(bruto);
  } catch {
    return JSON.parse(decodeURIComponent(bruto));
  }
}

export function temSessaoViva(cookies: readonly Cookie[], agoraMs: number = Date.now()): boolean {
  const bruto = juntarPedacos(cookies);
  if (!bruto) return false;
  try {
    const sessao = lerJson(bruto) as { expires_at?: unknown };
    return typeof sessao.expires_at === "number" && sessao.expires_at * 1000 + FOLGA_MS > agoraMs;
  } catch {
    return false;
  }
}
