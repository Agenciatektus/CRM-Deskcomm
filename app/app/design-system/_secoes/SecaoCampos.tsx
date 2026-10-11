"use client";

import { useId, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";

import { Estados, Exemplo, Secao } from "../_componentes/Secao";
import { SegmentadoEAbas } from "./SecaoMarcadores";
import type { Tema } from "../_componentes/tema";

function Campo({ rotulo, children }: { rotulo: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex w-56 flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children(id)}
    </div>
  );
}

export function SecaoCampos({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao id={`campos-${tema}`} sub titulo={t("Navegação e campos")} mapa="ds:navegacao-campos" tema={tema}>
      <SegmentadoEAbas tema={tema} />
      <Exemplo nome="Input" mapa="comp:input" tema={tema}>
        <Estados
          itens={[
            { rotulo: t("Padrão"), no: <Campo rotulo={t("Nome")}>{(id) => <Input id={id} placeholder={t("Nome completo")} />}</Campo> },
            { rotulo: t("Preenchido"), no: <Campo rotulo={t("Nome")}>{(id) => <Input id={id} defaultValue="Mariana Couto" />}</Campo> },
            { rotulo: t("Com erro"), no: <Campo rotulo={t("E-mail")}>{(id) => <Input id={id} aria-invalid defaultValue="mariana@" />}</Campo> },
            { rotulo: t("Desativado"), no: <Campo rotulo={t("Nome")}>{(id) => <Input id={id} disabled defaultValue="Mariana Couto" />}</Campo> },
          ]}
        />
      </Exemplo>
      <Exemplo nome="Textarea" mapa="comp:textarea" tema={tema}>
        <Estados
          itens={[
            { rotulo: t("Padrão"), no: <Campo rotulo={t("Observações")}>{(id) => <Textarea id={id} placeholder={t("Escreva uma observação")} />}</Campo> },
            { rotulo: t("Desativado"), no: <Campo rotulo={t("Observações")}>{(id) => <Textarea id={id} disabled />}</Campo> },
          ]}
        />
      </Exemplo>
      <Exemplo nome={t("Select nativo")} mapa="comp:select-nativo" tema={tema}>
        <Estados
          itens={[
            {
              rotulo: t("Padrão"),
              no: (
                <Campo rotulo={t("Responsável")}>
                  {(id) => (
                    <select id={id} defaultValue="ana" className="w-full">
                      <option value="ana">Ana Lima</option>
                      <option value="bruno">Bruno Reis</option>
                    </select>
                  )}
                </Campo>
              ),
            },
            {
              rotulo: t("Desativado"),
              no: (
                <Campo rotulo={t("Responsável")}>
                  {(id) => (
                    <select id={id} disabled className="w-full">
                      <option>Ana Lima</option>
                    </select>
                  )}
                </Campo>
              ),
            },
          ]}
        />
      </Exemplo>
      <Exemplo nome={t("Select (Radix)")} mapa="comp:select-radix" tema={tema}>
        <Estados
          itens={[
            {
              rotulo: t("Padrão"),
              no: (
                <Select defaultValue="aberta">
                  <SelectTrigger className="w-56" aria-label={t("Situação")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">{t("Aberta")}</SelectItem>
                    <SelectItem value="fechada">{t("Fechada")}</SelectItem>
                  </SelectContent>
                </Select>
              ),
            },
            {
              rotulo: t("Desativado"),
              no: (
                <Select disabled>
                  <SelectTrigger className="w-56" aria-label={t("Situação")}>
                    <SelectValue placeholder={t("Escolha")} />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              ),
            },
          ]}
        />
      </Exemplo>
      <Exemplo nome={t("Caixa de seleção e opção")} mapa="comp:checkbox" tema={tema}>
        <div className="flex flex-wrap gap-6 text-ui">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-primary" defaultChecked /> {t("Marcada")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-primary" /> {t("Desmarcada")}
          </label>
          <label className="flex items-center gap-2 text-text-subtle">
            <input type="checkbox" className="size-4 accent-primary" disabled /> {t("Desativado")}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`ds-radio-${tema}`} className="size-4 accent-primary" defaultChecked /> {t("Opção A")}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`ds-radio-${tema}`} className="size-4 accent-primary" /> {t("Opção B")}
          </label>
        </div>
        <p className="text-meta text-text-subtle">
          {t("O CRM não tem componente de caixa de seleção: as telas usam o controle nativo com accent-primary.")}
        </p>
      </Exemplo>
      <Exemplo nome="Switch" mapa="comp:switch" tema={tema}>
        <Estados
          itens={[
            { rotulo: t("Desligado"), no: <Switch aria-label={t("Desligado")} /> },
            { rotulo: t("Ligado"), no: <Switch aria-label={t("Ligado")} defaultChecked /> },
            { rotulo: t("Desativado"), no: <Switch aria-label={t("Desativado")} disabled defaultChecked /> },
          ]}
        />
      </Exemplo>
    </Secao>
  );
}
