"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { rotaDeTemplates } from "@/lib/channels/templates-fonte";
import { CaretLeft } from "@/lib/ui/icons";

import { CanalGraphParceiroClient } from "./CanalGraphParceiroClient";
import { CanalHospedadoClient } from "./CanalHospedadoClient";
import { CanalInstagramClient } from "./CanalInstagramClient";
import { CanalOficialClient } from "./CanalOficialClient";
import { CanalParceiroClient } from "./CanalParceiroClient";
import { CanalVozClient } from "./CanalVozClient";
import { ConexoesPagina } from "./ConexoesPagina";
import { TelefoniaClient } from "./TelefoniaClient";
import { TemplatesClient } from "./TemplatesClient";
import { TemplatesParceiroClient } from "./TemplatesParceiroClient";

/**
 * Conexões: UMA página (lista de canais, filtros, Galeria/Lista) e as telas de apoio.
 *
 * A aba vive na URL (`?aba=`, `?sub=`) porque as rotas antigas (`/app/settings/canal-oficial`,
 * `/app/settings/templates`) e vários avisos apontam para cá. As telas de apoio são as de
 * criação que já existiam (API oficial, código, parceiro, Instagram, voz, telefone) e os
 * Modelos de mensagem; o assistente unificado vem numa fatia seguinte.
 *
 * `?aba=numeros` (números por QR) e `?aba=sociais` (redes sociais) saíram da navegação e
 * voltam para a página; o código dessas duas telas segue no repositório.
 */
const APOIO = ["oficial", "parceiro", "graph", "hospedado", "instagram", "voz", "telefonia", "modelos"];

function Apoio({ titulo, children }: { titulo: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/app/connections" className="inline-flex items-center gap-1 text-sm text-accent-text underline-offset-4 hover:underline">
          <CaretLeft size={14} aria-hidden />
          {t("Conexões")}
        </Link>
        <h2 className="text-base font-semibold">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

export function ConexoesShell({
  wahaConfigured,
  wahaDesligado = false,
  wacallsConfigured,
  graphParceiro = null,
}: {
  wahaConfigured: boolean;
  wahaDesligado?: boolean;
  wacallsConfigured: boolean;
  /** Parceiro compatível com a Cloud API: opcional da instalação (`null` = desligado). */
  graphParceiro?: { label: string } | null;
}) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const abaParam = params.get("aba") ?? "";
  const aba = APOIO.includes(abaParam) && (abaParam !== "graph" || graphParceiro) ? abaParam : "";
  const sub = params.get("sub") === "templates" ? "templates" : "conexao";
  const saiuDaNavegacao = abaParam === "numeros" || abaParam === "sociais";

  useEffect(() => {
    if (saiuDaNavegacao) router.replace("/app/connections", { scroll: false });
  }, [saiuDaNavegacao, router]);

  const irSub = (a: string, v: string) =>
    router.replace(v === "conexao" ? `/app/connections?aba=${a}` : `/app/connections?aba=${a}&sub=${v}`, { scroll: false });

  const comModelos = (a: string, conexao: ReactNode, modelos: ReactNode, rotuloModelos: string) => (
    <Tabs value={sub} onValueChange={(v) => irSub(a, v)} className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="conexao">{t("Conexão")}</TabsTrigger>
        <TabsTrigger value="templates">{rotuloModelos}</TabsTrigger>
      </TabsList>
      <TabsContent value="conexao" className="mt-0">{conexao}</TabsContent>
      <TabsContent value="templates" className="mt-0">{modelos}</TabsContent>
    </Tabs>
  );

  switch (aba) {
    case "oficial":
      return <Apoio titulo={t("API Oficial (Meta)")}>{comModelos("oficial", <CanalOficialClient />, <TemplatesClient />, t("Templates da Meta"))}</Apoio>;
    case "parceiro":
      return (
        <Apoio titulo={t("Provedor parceiro")}>
          {comModelos(
            "parceiro",
            <CanalParceiroClient />,
            <TemplatesParceiroClient />,
            t("Modelos do parceiro"),
          )}
        </Apoio>
      );
    case "graph":
      return <Apoio titulo={graphParceiro?.label ?? ""}>{comModelos("graph", <CanalGraphParceiroClient />, <TemplatesParceiroClient rota={rotaDeTemplates("graph")} />, t("Modelos"))}</Apoio>;
    case "hospedado":
      return <Apoio titulo={t("Código da Verdash")}><CanalHospedadoClient /></Apoio>;
    case "instagram":
      return <Apoio titulo={t("Instagram")}><CanalInstagramClient /></Apoio>;
    case "voz":
      return (
        <Apoio titulo={t("Chamada de voz")}>
          <CanalVozClient wacallsConfigured={wacallsConfigured} />
          <Link href="/app/connections?aba=telefonia" className="text-sm text-accent-text underline">{t("Telefone")}</Link>
        </Apoio>
      );
    case "telefonia":
      return <Apoio titulo={t("Telefone")}><TelefoniaClient /></Apoio>;
    case "modelos":
      return (
        <Apoio titulo={t("Modelos de mensagem")}>
          <Tabs defaultValue="meta" className="flex flex-col gap-4">
            <TabsList>
              <TabsTrigger value="meta">{t("Templates da Meta")}</TabsTrigger>
              <TabsTrigger value="parceiro">{t("Modelos do parceiro")}</TabsTrigger>
              {graphParceiro && <TabsTrigger value="graph">{graphParceiro.label}</TabsTrigger>}
            </TabsList>
            <TabsContent value="meta" className="mt-0"><TemplatesClient /></TabsContent>
            <TabsContent value="parceiro" className="mt-0"><TemplatesParceiroClient /></TabsContent>
            {graphParceiro && (
              <TabsContent value="graph" className="mt-0"><TemplatesParceiroClient rota={rotaDeTemplates("graph")} /></TabsContent>
            )}
          </Tabs>
        </Apoio>
      );
    default:
      return <ConexoesPagina wahaConfigured={wahaConfigured} wahaDesligado={wahaDesligado} graphParceiro={graphParceiro} />;
  }
}
