"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { ArrowRight, CheckCircle, CircleNotch, Info, Robot } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export type Passo = 1 | 2 | 3 | 4;
export type Uso = "sim" | "nao" | "nao_sei";

/** "Passo X de 4": bolinhas numeradas que viram check quando o passo foi dado. */
export function Etapas({ passo }: { passo: Passo }) {
  const t = useT();
  return (
    <div className="mt-4" role="group" aria-label={`${t("Passo")} ${passo} ${t("de")} 4`}>
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4] as Passo[]).map((p) => (
          <div key={p} className="flex flex-1 items-center gap-2 last:flex-none">
            <div
              aria-current={passo === p ? "step" : undefined}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                passo > p && "border-success-fg/40 bg-success-bg text-success-fg",
                passo === p && "border-accent bg-accent text-accent-foreground",
                passo < p && "border-border bg-surface-elevated text-text-muted",
              )}
            >
              {passo > p ? <CheckCircle size={16} weight="fill" aria-hidden /> : p}
            </div>
            {p < 4 && <div className={cn("h-px flex-1", passo > p ? "bg-success-fg/40" : "bg-border")} />}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-muted">{`${t("Passo")} ${passo} ${t("de")} 4`}</p>
    </div>
  );
}

export function PassoNome({
  nome,
  travado,
  onNome,
  onContinuar,
}: {
  nome: string;
  travado: boolean;
  onNome: (v: string) => void;
  onContinuar: () => void;
}) {
  const t = useT();
  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (nome.trim()) onContinuar();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assistente-nome">{t("Nome da conexão")}</Label>
        <Input
          id="assistente-nome"
          autoFocus
          value={nome}
          readOnly={travado}
          onChange={(e) => onNome(e.target.value)}
          placeholder={t("Ex.: Atendimento Comercial")}
          maxLength={60}
          autoComplete="off"
        />
        <p className="text-xs text-text-muted">{t("Um nome para reconhecer este número na lista de conexões.")}</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!nome.trim()}>
          {t("Continuar")} <ArrowRight size={16} aria-hidden />
        </Button>
      </div>
    </form>
  );
}

const USOS: { id: Uso; rotulo: string }[] = [
  { id: "sim", rotulo: "Sim" },
  { id: "nao", rotulo: "Não" },
  { id: "nao_sei", rotulo: "Não sei" },
];

export function PassoComo({
  uso,
  criando,
  onUso,
  onVoltar,
  onContinuar,
}: {
  uso: Uso | null;
  criando: boolean;
  onUso: (u: Uso) => void;
  onVoltar: () => void;
  onContinuar: () => void;
}) {
  const t = useT();
  if (criando) {
    return (
      <div role="status" className="mt-6 flex flex-col items-center gap-3 py-10">
        <CircleNotch size={28} className="animate-spin text-accent-text" aria-hidden />
        <p className="text-sm text-text-muted">{t("Preparando sua conexão…")}</p>
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p id="assistente-uso" className="text-sm font-medium text-text">
          {t("Você usa este WhatsApp em alguma plataforma de atendimento?")}
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
            {uso === "sim"
              ? t("Um número só pode estar ligado a um sistema por vez. Para trazer um número que já está conectado na Verdash, use a aba \"Número já conectado na Verdash\" desta tela.")
              : t("Saber se você já usa outra plataforma ajuda a escolher a conexão certa e evitar conflitos.")}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-text">{t("Como essa conta se conecta?")}</p>
        <div aria-current="true" className="flex items-start gap-3 rounded-lg border border-accent bg-surface-elevated px-3 py-2.5">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
          <span>
            <span className="block text-sm font-medium text-text">{t("QR Code")}</span>
            <span className="block text-xs text-text-muted">{t("QR Code, igual ao WhatsApp Web. Imediata e sem custo.")}</span>
          </span>
        </div>
        <p className="text-xs text-text-muted">
          {t("API oficial da Meta: conecte pela aba \"API oficial\". Número que já está na Verdash: aba \"Número já conectado na Verdash\".")}
        </p>
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onVoltar}>{t("Voltar")}</Button>
        <Button onClick={onContinuar}>{t("Continuar")} <ArrowRight size={16} aria-hidden /></Button>
      </div>
    </div>
  );
}

export function PassoSucesso({
  telefone,
  onAgente,
  onConcluir,
}: {
  telefone?: string | null;
  onAgente: () => void;
  onConcluir: () => void;
}) {
  const t = useT();
  return (
    <div aria-live="polite" className="mt-8 flex flex-col items-center gap-4 py-4 text-center">
      <CheckCircle size={56} weight="fill" className="text-success-fg" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold text-text">{t("WhatsApp conectado! 🎉")}</p>
        {telefone && <p className="font-mono text-sm text-text-muted">+{telefone}</p>}
        <p className="max-w-xs text-sm text-text-muted">{t("O CRM já recebe e envia mensagens por este número.")}</p>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface-elevated px-4 py-3 text-left">
        <p className="flex items-center gap-2 text-sm font-medium text-text">
          <Robot size={16} aria-hidden /> {t("Próximo passo: configurar o agente de IA")}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {t("Novos canais começam em modo de teste. Escolha quem a IA pode atender neste número antes de liberar.")}
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button autoFocus onClick={onAgente}>{t("Configurar o agente de IA")} <ArrowRight size={16} aria-hidden /></Button>
        <Button variant="link" onClick={onConcluir}>{t("Agora não, concluir")}</Button>
      </div>
    </div>
  );
}
