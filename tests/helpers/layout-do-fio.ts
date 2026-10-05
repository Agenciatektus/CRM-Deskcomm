/**
 * LAYOUT FALSO PARA O FIO VIRTUALIZADO NO JSDOM.
 *
 * O jsdom não faz layout: toda altura é 0 e `scrollTop` não rola nada. Um
 * virtualizador que lê alturas reais (`offsetHeight`) e a posição da rolagem
 * (`scrollTop` + evento `scroll`) não tem o que medir — e um teste que "passa"
 * assim não mede virtualização nenhuma.
 *
 * Isto dá ao rolador do fio (`.overflow-y-auto`) uma janela de `alturaDaTela`,
 * a cada linha medida (`[data-index]`) a altura `alturaDaLinha`, e uma rolagem
 * que funciona: `scrollTop` guarda e limita o valor, `scrollTo` rola e dispara
 * `scroll`, como o navegador.
 */
export function simularLayoutDoFio({ alturaDaTela = 600, alturaDaLinha = 60 } = {}) {
  const proto = HTMLElement.prototype;
  const nomes = ["offsetHeight", "offsetWidth", "clientHeight", "scrollHeight", "scrollTop"] as const;
  const originais = new Map(nomes.map((n) => [n, Object.getOwnPropertyDescriptor(proto, n)]));
  const scrollToOriginal = proto.scrollTo;
  const topos = new WeakMap<HTMLElement, number>();

  const ehRolador = (el: HTMLElement) =>
    typeof el.className === "string" && el.className.includes("overflow-y-auto");
  // A altura do conteúdo é a do contêiner do virtualizador (style.height).
  const alturaDoConteudo = (el: HTMLElement) =>
    parseFloat((el.firstElementChild as HTMLElement | null)?.style.height ?? "0") || 0;
  const maximo = (el: HTMLElement) => Math.max(0, alturaDoConteudo(el) - alturaDaTela);

  const definir = (nome: string, get: (this: HTMLElement) => number, set?: (this: HTMLElement, v: number) => void) =>
    Object.defineProperty(proto, nome, { configurable: true, get, set });

  definir("offsetHeight", function () {
    if (this.hasAttribute("data-index")) return alturaDaLinha;
    return ehRolador(this) ? alturaDaTela : 0;
  });
  definir("offsetWidth", function () {
    return ehRolador(this) || this.hasAttribute("data-index") ? 400 : 0;
  });
  definir("clientHeight", function () {
    return ehRolador(this) ? alturaDaTela : 0;
  });
  definir("scrollHeight", function () {
    return ehRolador(this) ? alturaDoConteudo(this) : 0;
  });
  definir(
    "scrollTop",
    function () {
      return topos.get(this) ?? 0;
    },
    function (v: number) {
      topos.set(this, Math.min(Math.max(0, v), ehRolador(this) ? maximo(this) : 0));
    },
  );
  proto.scrollTo = function (this: HTMLElement, a?: ScrollToOptions | number, b?: number) {
    const top = typeof a === "number" ? b : a?.top;
    if (top != null) this.scrollTop = top;
    this.dispatchEvent(new Event("scroll"));
  } as typeof proto.scrollTo;

  /** Rola o rolador do fio para `top` como o usuário faria. */
  const rolarPara = (rolador: HTMLElement, top: number) => rolador.scrollTo({ top });
  const rolarAoFim = (rolador: HTMLElement) => rolador.scrollTo({ top: maximo(rolador) });

  const desfazer = () => {
    for (const [nome, d] of originais) {
      if (d) Object.defineProperty(proto, nome, d);
      else delete (proto as unknown as Record<string, unknown>)[nome];
    }
    proto.scrollTo = scrollToOriginal;
  };
  return { rolarPara, rolarAoFim, maximo, desfazer };
}
