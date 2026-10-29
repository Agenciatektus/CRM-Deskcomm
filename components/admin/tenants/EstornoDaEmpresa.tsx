"use client";

import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { RegraDoEstorno } from "@/lib/cobranca/estorno";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";

interface Leitura {
  data: {
    cobranca: { ref: string; valor_cents: number; estornado_cents: number; moeda: string; paga_em: string } | null;
    sugestao: { cents: number; regra: RegraDoEstorno } | null;
  };
}

const FRASE_DA_REGRA: Record<RegraDoEstorno, string> = {
  arrependimento: "Até 7 dias depois do pagamento: devolução integral (direito de arrependimento).",
  anual_proporcional: "Plano anual depois de 7 dias: devolve os meses que ainda não começaram.",
  mensal_sem_estorno: "Plano mensal depois de 7 dias: a regra sugere não devolver, o mês foi usado.",
};

/** "12,50" ou "12.50" em reais → centavos; `null` se não for um valor. */
export function centavosDoCampo(texto: string): number | null {
  // "1.234,50" (milhar com ponto, decimal com vírgula) ou "1234.50"; "1.234" sem vírgula é decimal.
  const limpo = texto.trim();
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** Estorno pelo dono: lê a última cobrança, sugere o valor pela regra e devolve o que ele confirmar. */
export function EstornoDaEmpresa({ base, onFeito }: { base: string; onFeito: () => Promise<void> }) {
  const t = useT();
  const idioma = useIdioma();
  const [leitura, setLeitura] = useState<Leitura["data"] | null>(null);
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function abrir() {
    setOcupado(true);
    try {
      const r = await apiClient.get<Leitura>(`${base}/estorno`);
      setLeitura(r.data);
      setValor(r.data.sugestao ? (r.data.sugestao.cents / 100).toFixed(2).replace(".", ",") : "");
    } catch (err) {
      showApiError(err);
    } finally {
      setOcupado(false);
    }
  }

  async function estornar(cents: number, c: { ref: string; estornado_cents: number }) {
    setOcupado(true);
    try {
      await apiClient.post(`${base}/estorno`, { valor_cents: cents, cobranca_ref: c.ref, estornado_cents_visto: c.estornado_cents });
      toast.success(t("Estorno enviado ao provedor."));
      setLeitura(null);
      await onFeito();
    } catch (err) {
      showApiError(err);
      // O resultado pode ter sido ambíguo: relê o saldo para a próxima tentativa partir do que o provedor tem.
      setLeitura(null);
      await abrir();
    } finally {
      setOcupado(false);
    }
  }

  if (!leitura) {
    return (
      <Button variant="outline" disabled={ocupado} onClick={() => void abrir()}>
        {t("Estornar")}
      </Button>
    );
  }
  const c = leitura.cobranca;
  if (!c) return <p className="basis-full text-sm text-muted-foreground">{t("Nenhuma cobrança paga para estornar.")}</p>;
  const dinheiro = new Intl.NumberFormat(idioma, { style: "currency", currency: c.moeda.toUpperCase() });
  const saldo = c.valor_cents - c.estornado_cents;
  const cents = centavosDoCampo(valor);
  const invalido = cents === null || cents > saldo;
  return (
    <div className="basis-full space-y-2 rounded-md border p-3 text-sm">
      <p>
        {t("Último pagamento:")} {dinheiro.format(c.valor_cents / 100)}, {new Intl.DateTimeFormat(idioma, { dateStyle: "short" }).format(new Date(c.paga_em))}.{" "}
        {c.estornado_cents > 0 && `${t("Já devolvido:")} ${dinheiro.format(c.estornado_cents / 100)}. `}
        {t("Ainda pode devolver:")} {dinheiro.format(saldo / 100)}.
      </p>
      {leitura.sugestao && <p className="text-muted-foreground">{t(FRASE_DA_REGRA[leitura.sugestao.regra])}</p>}
      <p className="text-xs text-muted-foreground">{t("A taxa que o provedor cobrou no pagamento original não volta.")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="valor-do-estorno">{t("Valor a devolver")}</Label>
          <Input id="valor-do-estorno" className="w-32" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} aria-invalid={invalido} />
        </div>
        <Button variant="destructive" disabled={ocupado || invalido} onClick={() => cents !== null && void estornar(cents, c)}>
          {t("Confirmar estorno")}
        </Button>
        <Button variant="outline" disabled={ocupado} onClick={() => setLeitura(null)}>
          {t("Voltar")}
        </Button>
      </div>
    </div>
  );
}
