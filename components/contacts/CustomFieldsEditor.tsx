"use client";
import { useState } from "react";
/**
 * CustomFieldsEditor — lê `crm_pipelines.settings.fields[]` e renderiza o
 * input certo por tipo. Usado pelo dossiê e pelo painel do inbox, via
 * `LeadFieldsForm`, e pela ficha do contato (`EditContactDialog`) — é o
 * renderizador ÚNICO dos campos personalizados.
 *
 * Por isso o filtro de `mostrar_quando` (issue #2728) mora AQUI: um ponto só
 * cobre os quatro que renderizam, e o dia em que alguém desenhar as
 * definições por conta própria reprova
 * `tests/unit/campo-condicional-nos-pontos-de-renderizacao.test.ts`.
 */
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { parseReaisToCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { perfilDoPais } from "@/lib/legal/perfil-do-pais";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { buscarOpcoes, valorCanonico } from "@/lib/leads/campos-pesquisaveis";
import { cn } from "@/lib/utils";
import { camposVisiveis, type MostrarQuando } from "@/lib/schemas/mostrar-quando";

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "multiselect"
  | "searchable_select"
  | "boolean"
  | "email"
  | "phone"
  | "url";

export interface CustomFieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string; aliases?: string[] }>;
  /**
   * A condição de exibição (issue #2728) — `lib/schemas/mostrar-quando.ts`.
   *
   * Quem decide se o campo aparece é ESTE componente, olhando os valores que
   * ele mesmo está renderizando. Esconder é filtrar a lista: `value` não é
   * mexido, então o que já estava gravado continua dentro do estado do editor
   * e viaja no save — esconder não é limpar.
   */
  mostrar_quando?: MostrarQuando;
  /** Só no `searchable_select`: aceita valor fora da lista (issue #2521). */
  allow_new?: boolean;
}

interface Props {
  fields: CustomFieldDef[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  mode: "lead" | "contact";
  disabled?: boolean;
  className?: string;
}

export function CustomFieldsEditor({ fields, value, onChange, disabled, className }: Props) {
  const t = useT();
  const [rascunhosDeMoeda, setRascunhosDeMoeda] = useState<Record<string, string>>({});
  // O rascunho do `searchable_select`: enquanto a pessoa digita, o input mostra
  // o TEXTO buscado; o valor gravado no lead é o `value` canônico, resolvido no
  // blur (issue #2521). Sem o rascunho, editar apagaria a opção a cada tecla.
  const [rascunhosDeBusca, setRascunhosDeBusca] = useState<Record<string, string>>({});
  // Os campos cujo último blur RECUSOU o texto (fora da lista, sem `allow_new`).
  // Sem o aviso, o input só voltava ao valor anterior e a pessoa não sabia por quê.
  const [recusados, setRecusados] = useState<Record<string, true>>({});
  // O campo é do mesmo caminho do contato: o exemplo segue o país da
  // organização, e não o DDI brasileiro em duro.
  const telefoneExemplo = perfilDoPais(useActiveOrg()?.country).telefoneExemplo;
  function set(key: string, v: unknown) {
    onChange({ ...value, [key]: v });
  }

  /**
   * Os campos que ESTA vez aparecem — o filtro da condição (issue #2728).
   *
   * O filtro é sobre a LISTA, nunca sobre `value`: o que já estava gravado
   * continua dentro do objeto e viaja no save, e o campo volta à tela no
   * instante em que a condição cumpre. Esconder não é limpar.
   */
  const visiveis = camposVisiveis(fields, value);

  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}>
      {visiveis.map((f) => {
        const v = value[f.key];
        const id = `cf-${f.key}`;

        const labelEl = (
          <Label htmlFor={id}>
            {f.label}
            {f.required && <span className="ml-1 text-error-fg">*</span>}
          </Label>
        );

        switch (f.type) {
          case "textarea":
            return (
              <div key={f.key} className="space-y-2 md:col-span-2">
                {labelEl}
                <Textarea
                  id={id}
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={disabled}
                />
              </div>
            );
          case "number":
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="number"
                  value={typeof v === "number" ? v : ""}
                  onChange={(e) =>
                    set(f.key, e.target.value === "" ? null : Number(e.target.value))
                  }
                  disabled={disabled}
                />
              </div>
            );
          case "currency": {
            const valorNumerico = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : null;
            const formatado =
              valorNumerico !== null && Number.isFinite(valorNumerico)
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorNumerico)
                : "";
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="text"
                  inputMode="decimal"
                  value={rascunhosDeMoeda[f.key] ?? formatado}
                  onChange={(e) => setRascunhosDeMoeda((current) => ({ ...current, [f.key]: e.target.value }))}
                  onBlur={() => {
                    const draft = rascunhosDeMoeda[f.key];
                    if (draft === undefined) return;
                    const raw = draft.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
                    const centavos = raw === "" ? null : parseReaisToCents(raw);
                    if (centavos !== null) set(f.key, centavos / 100);
                    else if (raw === "") set(f.key, null);
                    setRascunhosDeMoeda((current) => {
                      const next = { ...current };
                      delete next[f.key];
                      return next;
                    });
                  }}
                  disabled={disabled}
                  placeholder="R$ 0,00"
                />
              </div>
            );
          }
          case "date":
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="date"
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={disabled}
                />
              </div>
            );
          case "select":
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Select
                  value={typeof v === "string" ? v : ""}
                  onValueChange={(val) => set(f.key, val)}
                  disabled={disabled}
                >
                  <SelectTrigger id={id}>
                    <SelectValue placeholder={t("Selecione…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options?.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          case "multiselect": {
            const current = Array.isArray(v) ? (v as string[]) : [];
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <div className="flex flex-col gap-1">
                  {f.options?.map((o) => {
                    const checked = current.includes(o.value);
                    return (
                      <label key={o.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...current, o.value]
                              : current.filter((x) => x !== o.value);
                            set(f.key, next);
                          }}
                          disabled={disabled}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          }
          case "searchable_select": {
            // LISTA PESQUISÁVEL (#2521): um input com autocompletar sobre as
            // opções. Grava o `value` CANÔNICO da opção escolhida ("maceio" →
            // "maceio-al"), nunca a grafia digitada — é o que faz o filtro e o
            // relatório de "Maceió" voltarem a bater. `allow_new` deixa passar
            // um valor novo, aparado, quando o funil o permite.
            const opcoes = f.options ?? [];
            const canonico = typeof v === "string" ? v : "";
            const rotuloAtual = opcoes.find((o) => o.value === canonico)?.label ?? canonico;
            const rascunho = rascunhosDeBusca[f.key];
            const listaId = `cf-${f.key}-opcoes`;
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="text"
                  list={listaId}
                  autoComplete="off"
                  placeholder={t("Digite para buscar…")}
                  value={rascunho ?? rotuloAtual}
                  onChange={(e) => {
                    setRascunhosDeBusca((current) => ({ ...current, [f.key]: e.target.value }));
                    setRecusados(({ [f.key]: _limpo, ...resto }) => resto);
                  }}
                  onBlur={() => {
                    const draft = rascunhosDeBusca[f.key];
                    if (draft === undefined) return;
                    const achado = valorCanonico(opcoes, draft);
                    if (achado !== null) set(f.key, achado);
                    else if (draft.trim() === "") set(f.key, "");
                    else if (f.allow_new === true) set(f.key, draft.trim());
                    // Sem casar e sem `allow_new`, o valor não é gravado: o
                    // input volta ao que estava, e o aviso abaixo explica.
                    else setRecusados((current) => ({ ...current, [f.key]: true }));
                    setRascunhosDeBusca((current) => {
                      const next = { ...current };
                      delete next[f.key];
                      return next;
                    });
                  }}
                  disabled={disabled}
                />
                <datalist id={listaId}>
                  {buscarOpcoes(opcoes, rascunho ?? "").map((o) => (
                    <option key={o.value} value={o.label} />
                  ))}
                </datalist>
                {recusados[f.key] && (
                  <p className="text-xs text-destructive">
                    {t("Esse valor não está na lista. Escolha uma das opções.")}
                  </p>
                )}
                {f.allow_new === true && (
                  <p className="text-xs text-muted-foreground">
                    {t("Este campo aceita um valor novo, fora da lista.")}
                  </p>
                )}
              </div>
            );
          }
          case "boolean":
            return (
              <div key={f.key} className="flex items-center justify-between gap-4 md:col-span-2">
                {labelEl}
                <Switch
                  id={id}
                  checked={Boolean(v)}
                  onCheckedChange={(c) => set(f.key, c)}
                  disabled={disabled}
                />
              </div>
            );
          case "email":
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="email"
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={disabled}
                />
              </div>
            );
          case "phone":
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="tel"
                  placeholder={telefoneExemplo}
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">{t("Formato E.164")}</p>
              </div>
            );
          case "url":
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="url"
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={disabled}
                />
              </div>
            );
          case "text":
          default:
            return (
              <div key={f.key} className="space-y-2">
                {labelEl}
                <Input
                  id={id}
                  type="text"
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={disabled}
                />
              </div>
            );
        }
      })}
    </div>
  );
}
