"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export type Uso = "sim" | "nao" | "nao_sei";
/** O que a pessoa escolhe no passo 2. Só `qr` cria o canal já ao Continuar. */
export type Metodo = "codigo" | "qr" | "oficial" | "parceiro";

/**
 * Recomendação REAL por resposta. "Não" => QR (ninguém mais usa o número, o caminho
 * mais curto). "Sim" => o número já está noutra plataforma, o caminho é trazê-lo
 * pelo código da Verdash. "Não sei" não recomenda: manda conferir no aplicativo.
 */
export function recomendar(uso: Uso | null, nativo: boolean): Metodo | null {
  if (uso === "sim") return "codigo";
  if (uso === "nao" && nativo) return "qr";
  return null;
}

const USOS: { id: Uso; rotulo: string }[] = [
  { id: "sim", rotulo: "Sim" },
  { id: "nao", rotulo: "Não" },
  { id: "nao_sei", rotulo: "Não sei" },
];

function Recomendacao({ uso }: { uso: Uso }) {
  const t = useT();
  if (uso === "sim") {
    return (
      <div role="note" className="flex gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
        <Warning size={14} className="mt-0.5 shrink-0" aria-hidden />
        <p className="text-xs leading-relaxed text-text">
          {t("Recomendamos \"Número já conectado na Verdash\": o mesmo número continua onde está e as conversas passam a aparecer aqui. Se o mesmo número tiver dois canais, as mensagens chegam duplicadas.")}
        </p>
      </div>
    );
  }
  if (uso === "nao") {
    return (
      <div role="note" className="flex gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
        <Info size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <p className="text-xs leading-relaxed text-text-muted">
          {t("Como o número não está em outra plataforma, recomendamos o QR Code: é imediato e sem custo.")}
        </p>
      </div>
    );
  }
  return (
    <div role="note" className="flex gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
      <Info size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
      <p className="text-xs leading-relaxed text-text-muted">
        {t("Para conferir, abra o WhatsApp Business no celular: Configurações > Ferramentas comerciais > Conta > Empresas conectadas. Se aparecer alguma empresa ali, o número já está em outra plataforma.")}
      </p>
    </div>
  );
}

export function PassoMetodo({
  uso,
  metodo,
  nativo,
  onUso,
  onMetodo,
}: {
  uso: Uso | null;
  metodo: Metodo | null;
  /** A organização pode criar a conexão por QR neste CRM. */
  nativo: boolean;
  onUso: (u: Uso) => void;
  onMetodo: (m: Metodo) => void;
}) {
  const t = useT();
  const recomendado = recomendar(uso, nativo);
  const cartoes: { id: Metodo; titulo: string; ajuda: string }[] = [
    { id: "codigo", titulo: t("Número já conectado na Verdash"), ajuda: t("Usa o WhatsApp que já está na Verdash, com um código de uso único.") },
    ...(nativo ? [{ id: "qr" as const, titulo: t("QR Code"), ajuda: t("QR Code, igual ao WhatsApp Web. Imediata e sem custo.") }] : []),
    { id: "oficial", titulo: t("API Oficial"), ajuda: t("Número oficial da Meta, com modelos de mensagem.") },
    { id: "parceiro", titulo: t("Provedor parceiro"), ajuda: t("Número ligado por um provedor parceiro.") },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p id="assistente-uso" className="text-sm font-medium text-text">
          {t("Você usa este WhatsApp em alguma plataforma?")}
        </p>
        <div role="radiogroup" aria-labelledby="assistente-uso" className="flex flex-wrap gap-2">
          {USOS.map((o) => (
            <Button key={o.id} type="button" role="radio" aria-checked={uso === o.id} size="sm" variant={uso === o.id ? "default" : "outline"} onClick={() => onUso(o.id)}>
              {t(o.rotulo)}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
          <Info size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-text-muted">
            <b>{t("Por que perguntamos")}</b>{" "}
            {t("Um número só pode estar ligado a um sistema por vez. Saber se você já usa outra plataforma ajuda a escolher a conexão certa e evitar conflitos.")}
          </p>
        </div>
        {uso && <Recomendacao uso={uso} />}
      </div>
      <div className="flex flex-col gap-2">
        <p id="assistente-metodo" className="text-sm font-medium text-text">{t("Como conectar?")}</p>
        <div role="radiogroup" aria-labelledby="assistente-metodo" className="flex flex-col gap-2">
          {cartoes.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={metodo === c.id}
              onClick={() => onMetodo(c.id)}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-surface-elevated px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                metodo === c.id ? "border-accent" : "border-border",
              )}
            >
              <CheckCircle size={18} weight={metodo === c.id ? "fill" : "regular"} className={cn("mt-0.5 shrink-0", metodo === c.id ? "text-accent-text" : "text-text-muted")} aria-hidden />
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                  {c.titulo}
                  {recomendado === c.id && <Badge variant="secondary">{t("Recomendado")}</Badge>}
                </span>
                <span className="block text-xs text-text-muted">{c.ajuda}</span>
              </span>
            </button>
          ))}
        </div>
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer text-accent-text">{t("Entenda cada método")}</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
            <li>{t("Número já conectado na Verdash: o WhatsApp continua na plataforma onde está e você cola um código de uso único.")}</li>
            <li>{t("QR Code: você lê um código com o celular, como no WhatsApp Web. O aparelho precisa ficar com internet.")}</li>
            <li>{t("API Oficial: número ligado direto à Meta, com credenciais do seu app. Exige conta Business verificada.")}</li>
            <li>{t("Provedor parceiro: o número fica com um provedor que entrega as mensagens ao CRM.")}</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
