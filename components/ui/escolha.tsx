"use client";

import * as React from "react";

import { useT } from "@/hooks/i18n/useT";

import { juntarDescricao, useControleEscondido } from "./controle-escondido";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./select";

/**
 * O seletor do design system no lugar do `<select>` nativo (regra 6 do quadro:
 * "nada de controle nativo genérico"). Por baixo é o `Select` do Radix
 * (`components/ui/select`); a API imita a do nativo para a troca ser direta:
 * `value`/`defaultValue` em texto, e as opções vêm como `opcoes` OU como os
 * mesmos `<option>`/`<optgroup>` que o nativo tinha (lidos, não desenhados).
 *
 * O VALOR VAZIO existe: o Radix não aceita `<SelectItem value="">`, então a
 * opção vazia ("Todos", "Escolha") anda com um valor interno e volta como "".
 *
 * O `<select>` ESCONDIDO é o padrão do shadcn/Radix para formulário: ele leva
 * `name`, `required` e `form`, então server action e `FormData` recebem o
 * valor como recebiam do nativo, e a validação do navegador continua. Ele
 * também leva o `data-testid` e repassa a mudança (preenchimento automático,
 * `selectOption` do Playwright): quem só lê ou escreve o valor não precisa
 * saber que o controle visível é outro. Fica fora da árvore de acessibilidade
 * (`aria-hidden`) e do Tab; quem usa teclado ou leitor de tela fala com o
 * gatilho, que recebe `id` e os `aria-*`.
 */
export type OpcaoDeEscolha = { value: string; label: React.ReactNode; disabled?: boolean };
export type GrupoDeEscolha = { grupo: string; opcoes: OpcaoDeEscolha[] };
export type ItemDeEscolha = OpcaoDeEscolha | GrupoDeEscolha;

const VAZIO = "__vazio__";
const paraDentro = (v: string) => (v === "" ? VAZIO : v);
const paraFora = (v: string) => (v === VAZIO ? "" : v);
const ehGrupo = (i: ItemDeEscolha): i is GrupoDeEscolha => "grupo" in i;

/** O texto puro de um rótulo (o `<option>` escondido só aceita texto). */
function textoDe(no: React.ReactNode): string {
  if (no === null || no === undefined || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(no)) return textoDe(no.props.children);
  return "";
}

type PropsDaOpcao = { value?: string | number; children?: React.ReactNode; disabled?: boolean; label?: string };

/** Lê os `<option>`/`<optgroup>` (com fragmentos e listas) como itens. */
export function itensDosFilhos(filhos: React.ReactNode): ItemDeEscolha[] {
  const itens: ItemDeEscolha[] = [];
  React.Children.forEach(filhos, (filho) => {
    if (!React.isValidElement<PropsDaOpcao>(filho)) return;
    if (filho.type === React.Fragment) {
      itens.push(...itensDosFilhos(filho.props.children));
    } else if (filho.type === "optgroup") {
      const opcoes = itensDosFilhos(filho.props.children).flatMap((i) => (ehGrupo(i) ? i.opcoes : [i]));
      itens.push({ grupo: filho.props.label ?? "", opcoes });
    } else if (filho.type === "option") {
      const { value, children, disabled } = filho.props;
      itens.push({ value: value === undefined ? textoDe(children) : String(value), label: children, disabled });
    }
  });
  return itens;
}

export function opcoesPlanas(itens: readonly ItemDeEscolha[]): OpcaoDeEscolha[] {
  return itens.flatMap((i) => (ehGrupo(i) ? i.opcoes : [i]));
}

export interface EscolhaProps {
  opcoes?: readonly ItemDeEscolha[];
  /** Os `<option>`/`<optgroup>` do nativo, quando não se usa `opcoes`. */
  children?: React.ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (valor: string) => void;
  placeholder?: React.ReactNode;
  id?: string;
  name?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Classe do painel das opções (largura, altura). */
  classeDoPainel?: string;
  title?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-testid"?: string;
}

export function Escolha({
  opcoes,
  children,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  id,
  name,
  form,
  required,
  disabled,
  className,
  classeDoPainel,
  title,
  "data-testid": testId,
  ...aria
}: EscolhaProps) {
  const t = useT();
  const padrao = defaultValue === undefined ? "" : String(defaultValue);
  const [interno, setInterno] = React.useState(padrao);
  const atual = value === undefined || value === null ? interno : String(value);
  const gatilho = React.useRef<HTMLButtonElement>(null);
  const idDoErro = React.useId();
  const { ref: refEscondido, invalido, limparInvalido } = useControleEscondido<HTMLSelectElement>({
    gatilho,
    // Não controlado volta ao `defaultValue`; controlado continua com o valor
    // do estado de quem usa, e o escondido é reposto para não divergir.
    aoResetar: () => {
      if (value === undefined) setInterno(padrao);
      else if (refEscondido.current) refEscondido.current.value = atual;
    },
  });
  const itens = opcoes ?? itensDosFilhos(children);
  const planas = opcoesPlanas(itens);
  const temVazia = planas.some((o) => o.value === "");
  // Sem opção vazia, "" é "nada escolhido": o gatilho mostra o placeholder.
  const valorDoRadix = atual === "" && !temVazia ? "" : paraDentro(atual);

  function mudar(v: string) {
    limparInvalido();
    if (value === undefined) setInterno(v);
    onValueChange?.(v);
  }

  const item = (o: OpcaoDeEscolha) => (
    <SelectItem key={o.value || VAZIO} value={paraDentro(o.value)} disabled={o.disabled}>
      {o.label}
    </SelectItem>
  );

  return (
    <>
      <Select value={valorDoRadix} onValueChange={(v) => mudar(paraFora(v))} disabled={disabled}>
        <SelectTrigger
          ref={gatilho}
          id={id}
          title={title}
          className={className}
          data-escolha=""
          {...aria}
          aria-invalid={invalido || aria["aria-invalid"] || undefined}
          aria-describedby={juntarDescricao(aria["aria-describedby"], invalido && idDoErro)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={classeDoPainel}>
          {itens.map((i) =>
            ehGrupo(i) ? (
              <SelectGroup key={`g:${i.grupo}`}>
                <SelectLabel className="text-meta text-text-subtle">{i.grupo}</SelectLabel>
                {i.opcoes.map(item)}
              </SelectGroup>
            ) : (
              item(i)
            ),
          )}
        </SelectContent>
      </Select>
      <select
        ref={refEscondido}
        data-escolha-nativa=""
        aria-hidden
        tabIndex={-1}
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        data-testid={testId}
        value={atual}
        onChange={(e) => mudar(e.target.value)}
        className="sr-only"
      >
        {!temVazia && <option value="" />}
        {planas.map((o) => (
          <option key={o.value || VAZIO} value={o.value} disabled={o.disabled}>
            {textoDe(o.label)}
          </option>
        ))}
      </select>
      {invalido && (
        <span id={idDoErro} role="alert" className="text-meta text-error-fg">
          {t("Escolha uma opção.")}
        </span>
      )}
    </>
  );
}
