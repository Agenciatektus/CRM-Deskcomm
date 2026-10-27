"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { traduzir } from "@/lib/i18n/traducao";
import type { Idioma } from "@/lib/i18n/idiomas";
import { DIAS_DE_AVISO_DE_VENCIMENTO } from "@/lib/plataformas-de-anuncio/meta/oauth/validade";
import { ListaDeEmpresas } from "./_lista-de-empresas";

const LINK_DE_CONEXAO = "/api/v1/plataformas-de-anuncio/meta/connect";

/** Mesma conta do formulário: sem data, não há o que avisar. */
export function estadoDaConexao(
  diasParaVencer: number | null,
  precisaReconectar: boolean,
): "ok" | "vencendo" | "vencida" | "reconectar" {
  if (precisaReconectar) return "reconectar";
  if (diasParaVencer !== null && diasParaVencer <= 0) return "vencida";
  if (diasParaVencer !== null && diasParaVencer < DIAS_DE_AVISO_DE_VENCIMENTO) return "vencendo";
  return "ok";
}

function Numero({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-border px-4 first:pl-0 sm:border-l sm:first:border-l-0">
      <span className="text-xs text-text-muted">{rotulo}</span>
      <span className="flex items-center gap-2 text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * Uma faixa só com o estado da conexão: quem conectou, selo, três números e as
 * ações. O aviso de vencimento ou de reconexão é a segunda linha da própria faixa.
 */
export function PainelDeStatusMeta({
  nome,
  via,
  empresas,
  totalDeContas,
  expiraEm,
  diasParaVencer,
  precisaReconectar,
  oauthDisponivel,
  oauthFalta = [],
  ocupado,
  onDesconectar,
  idioma,
}: {
  nome: string | null;
  via: "manual" | "oauth" | null;
  empresas: { id: string; name: string }[];
  /** `null` enquanto a lista de contas não chegou. */
  totalDeContas: number | null;
  expiraEm: string | null;
  diasParaVencer: number | null;
  precisaReconectar: boolean;
  oauthDisponivel: boolean;
  /** Variáveis de ambiente que faltam para o botão Conectar existir. */
  oauthFalta?: string[];
  ocupado: boolean;
  onDesconectar: () => void;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const [verEmpresas, setVerEmpresas] = useState(false);
  const estado = estadoDaConexao(diasParaVencer, precisaReconectar);
  const venceu = diasParaVencer !== null && diasParaVencer <= 0;
  const selo = {
    ok: { variante: "success", texto: "Conectada" },
    vencendo: { variante: "warning", texto: "Vence em breve" },
    vencida: { variante: "error", texto: "Vencida" },
    reconectar: { variante: "error", texto: "Precisa reconectar" },
  } as const;

  return (
    <section
      data-testid="meta-conectar"
      aria-label={t("Conexão com a Meta")}
      className="rounded-lg border border-border bg-surface"
    >
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2" data-testid="meta-identidade">
            <span className="text-sm font-medium">
              {nome ? t("Conectado como {nome}").replace("{nome}", () => nome) : t("Conectada com token colado")}
            </span>
            <Badge variant={selo[estado].variante}>{t(selo[estado].texto)}</Badge>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-0">
            <Numero rotulo={t("Contas")}>{totalDeContas ?? "…"}</Numero>
            {via === "oauth" && (
              <Numero rotulo={t("Empresas")}>
                {empresas.length}
                {empresas.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={verEmpresas}
                    aria-controls="meta-empresas"
                    onClick={() => setVerEmpresas((v) => !v)}
                  >
                    {verEmpresas ? t("Ocultar") : t("Ver")}
                  </Button>
                )}
              </Numero>
            )}
            {via === "oauth" && expiraEm && (
              <Numero rotulo={venceu ? t("Token venceu em") : t("Token vale até")}>
                <span data-testid="meta-validade">{expiraEm}</span>
              </Numero>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {oauthDisponivel && (
            <a href={LINK_DE_CONEXAO}>
              <Button type="button" variant="outline" disabled={ocupado}>
                {via === "oauth" ? t("Reconectar com Meta") : t("Conectar com Meta")}
              </Button>
            </a>
          )}
          <Button type="button" variant="outline" disabled={ocupado} onClick={onDesconectar}>
            {t("Desconectar")}
          </Button>
        </div>
      </div>

      {!oauthDisponivel && (
        <p className="border-t border-border px-4 py-3 text-sm text-text-muted" data-testid="meta-nao-configurado">
          {t(
            "Conectar com a Meta ainda não está disponível nesta instalação. Quem instalou o sistema precisa configurar",
          )}{" "}
          <span className="font-mono text-xs">{oauthFalta.join(` ${t("e")} `)}</span>
          {". "}
          {t("Enquanto isso, você pode colar um token à mão abaixo.")}
        </p>
      )}
      {oauthDisponivel && via !== "oauth" && (
        <p className="border-t border-border px-4 py-3 text-sm" data-testid="meta-substitui-manual">
          {t("Conectar com a Meta substitui o token que está salvo agora.")}
        </p>
      )}
      {oauthDisponivel && estado === "reconectar" && (
        <p
          role="alert"
          data-testid="meta-precisa-reconectar"
          className="border-t border-border bg-error-bg px-4 py-3 text-sm font-medium text-error-fg"
        >
          {t("A Meta recusou renovar o acesso. Reconecte agora.")}
        </p>
      )}
      {oauthDisponivel && (estado === "vencendo" || estado === "vencida") && (
        <p
          role="alert"
          data-testid="meta-aviso-de-vencimento"
          className={
            estado === "vencida"
              ? "border-t border-border bg-error-bg px-4 py-3 text-sm font-medium text-error-fg"
              : "border-t border-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-fg"
          }
        >
          {estado === "vencida"
            ? t("Reconecte agora para voltar a ler as campanhas.")
            : t("O token está perto de vencer. Reconecte para renovar por mais 60 dias.")}
        </p>
      )}
      {verEmpresas && <ListaDeEmpresas id="meta-empresas" empresas={empresas} idioma={idioma} />}
    </section>
  );
}
