/** O tema de um painel da vitrine, no vocabulário do mapa (`claro`/`escuro`). */
export type Tema = "claro" | "escuro";

/** Como a vitrine mostra os temas: um de cada vez ou os dois lado a lado. */
export type ModoDaVitrine = "claro" | "escuro" | "lado";

export const ATRIBUTO_DO_TEMA: Record<Tema, "light" | "dark"> = { claro: "light", escuro: "dark" };
