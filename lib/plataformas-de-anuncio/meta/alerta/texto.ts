import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

import type { Pendencia } from "./marcos";

/** O texto do alerta, no idioma da organização (ninguém está logado no cron). */
export function textoDoAlerta(p: Pendencia, idioma: Idioma): { titulo: string; corpo: string } {
  const t = (s: string) => traduzir(s, idioma);
  if (p.recusada) {
    return {
      titulo: t("A Meta recusou renovar o acesso"),
      corpo: t(
        "A tela de campanhas (Análise > Meta Ads) parou de atualizar. Para voltar, vá em Ajustes > Meta Ads e clique em Reconectar com Meta.",
      ),
    };
  }
  if (p.diasRestantes > 0) {
    return {
      titulo:
        p.diasRestantes === 1
          ? t("O acesso à Meta vence em 1 dia")
          : t("O acesso à Meta vence em {n} dias").replace("{n}", String(p.diasRestantes)),
      corpo: t(
        "Quando vencer, a tela de campanhas (Análise > Meta Ads) para de atualizar. Para evitar, vá em Ajustes > Meta Ads e clique em Reconectar com Meta.",
      ),
    };
  }
  return {
    titulo: t("O acesso à Meta venceu"),
    corpo: t(
      "A tela de campanhas (Análise > Meta Ads) parou de atualizar. Para voltar, vá em Ajustes > Meta Ads e clique em Reconectar com Meta.",
    ),
  };
}
