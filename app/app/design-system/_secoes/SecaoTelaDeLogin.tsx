"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { IMAGEM_DA_FACHADA } from "@/lib/branding/fachada";

import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

/**
 * A amostra é uma miniatura da composição, feita com os mesmos primitivos da
 * tela real (`Input`, `Label`, `Button`) e a mesma imagem. É só a composição:
 * a tela de verdade é `app/(public)/layout.tsx` (a casca, com a imagem) mais a
 * página de cada passo, e a imagem vive em `lib/branding/fachada.ts`.
 *
 * `inert`: a miniatura não é formulário, e quem navega por teclado não deve
 * parar em campos que não levam a lugar nenhum.
 */
function Miniatura() {
  const t = useT();
  const id = useId();
  const { retrato } = IMAGEM_DA_FACHADA;
  return (
    <div
      inert
      className="flex h-80 overflow-hidden rounded-xl border border-border bg-bg p-2"
    >
      <div
        data-theme="dark"
        className="relative flex-[1.15] overflow-hidden rounded-lg bg-background"
      >
        <div aria-hidden className="absolute inset-0 bg-(image:--pele-grad-soft)" />
        <picture>
          <source srcSet={`${retrato.base}.avif`} type="image/avif" />
          <source srcSet={`${retrato.base}.webp`} type="image/webp" />
          <img
            src={`${retrato.base}.jpg`}
            alt=""
            width={retrato.largura}
            height={retrato.altura}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-[30%_50%]"
          />
        </picture>
        <p className="relative ml-auto w-2/5 p-5 text-label font-bold text-balance text-foreground">
          {t("Atendimento, funil e IA no mesmo lugar.")}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center px-5">
        <div className="flex w-full max-w-56 flex-col gap-3">
          <p className="text-title-sm font-bold">{t("Entrar")}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-email`}>{t("Email")}</Label>
            <Input id={`${id}-email`} readOnly tabIndex={-1} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-senha`}>{t("Senha")}</Label>
            <Input id={`${id}-senha`} type="password" readOnly tabIndex={-1} />
          </div>
          <Button type="button" tabIndex={-1} className="w-full">
            {t("Entrar")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SecaoTelaDeLogin({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao
      id={`login-${tema}`}
      titulo={t("Tela de login (dividida)")}
      apoio={t(
        "Imagem de marca de um lado, formulário do outro. A imagem é decorativa e sempre escura; o formulário segue o tema.",
      )}
    >
      <Miniatura />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Tela")}</TableHead>
            <TableHead>{t("Imagem")}</TableHead>
            <TableHead>{t("Formulário")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono text-label">
          <TableRow>
            <TableCell>≥ 1024</TableCell>
            <TableCell>{t("painel à esquerda, altura inteira")}</TableCell>
            <TableCell>{t("centralizado, 400 px")}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>&lt; 1024</TableCell>
            <TableCell>{t("faixa de 96 px no topo")}</TableCell>
            <TableCell>{t("ocupa a tela")}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="text-meta text-text-subtle">
        {t(
          "Sem a imagem, o painel cai no degradê suave da marca sobre o fundo escuro. O formulário não espera a imagem carregar.",
        )}
      </p>
    </Secao>
  );
}
