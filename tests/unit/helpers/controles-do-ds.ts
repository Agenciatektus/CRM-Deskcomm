/**
 * Ajuda para teste de tela que antes falava com `<select>` e com campo nativo
 * de data/hora (PR D do design system). O rótulo agora aponta para o GATILHO
 * (o botão que a pessoa vê); o valor mora no `<select>`/`<input>` escondido ao
 * lado dele, que é o que vai para o formulário. Estas funções acham esse
 * escondido a partir do gatilho, para o teste ler e trocar o valor como antes.
 */
import { fireEvent } from "@testing-library/react";

/** O `<select>` escondido do `Escolha` cujo gatilho é `gatilho`. */
export function selectDaEscolha(gatilho: HTMLElement): HTMLSelectElement {
  let irmao = gatilho.nextElementSibling;
  while (irmao && !irmao.hasAttribute("data-escolha-nativa")) irmao = irmao.nextElementSibling;
  if (!irmao) throw new Error("gatilho sem o <select> escondido do Escolha ao lado");
  return irmao as HTMLSelectElement;
}

/** Troca o valor do `Escolha` pelo `<select>` escondido (como o preenchimento automático). */
export function escolherValor(gatilho: HTMLElement, valor: string): void {
  fireEvent.change(selectDaEscolha(gatilho), { target: { value: valor } });
}

/** Os rótulos das opções do `Escolha`, na ordem (o vazio de controle fica de fora). */
export function opcoesDaEscolha(gatilho: HTMLElement): string[] {
  return Array.from(selectDaEscolha(gatilho).options)
    .filter((o) => o.value !== "" || o.textContent !== "")
    .map((o) => o.textContent ?? "");
}

/** O `<input>` escondido do `CampoDeData` cujo gatilho é `gatilho`. */
export function entradaDoCampoDeData(gatilho: HTMLElement): HTMLInputElement {
  const entrada = gatilho.parentElement?.querySelector<HTMLInputElement>("input[data-campo-nativo]");
  if (!entrada) throw new Error("gatilho sem o <input> escondido do CampoDeData");
  return entrada;
}

/** Escreve o valor no formato do campo nativo (`2026-10-12`, `14:30`). */
export function preencherData(gatilho: HTMLElement, valor: string): void {
  fireEvent.change(entradaDoCampoDeData(gatilho), { target: { value: valor } });
}
