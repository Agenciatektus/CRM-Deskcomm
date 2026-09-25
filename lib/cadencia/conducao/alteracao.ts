import type { ConducaoDaCadencia, ModoDaConducao } from "./settings";

/**
 * QUEM PODE MUDAR O QUÊ NA CONDUÇÃO — regra pura, aplicada pelo PATCH da cadência.
 *
 * Exige ADMIN o que decide QUEM fala com o lead e COMO:
 *   - `quem_atende` (pessoa ↔ IA);
 *   - `agent_id` (outro agente é outro prompt, outras ferramentas, outro custo);
 *   - `instrucao` (texto que entra no prompt da conversa);
 *   - `modo` de `assistido` para `automatico` (tira a pessoa que aprova).
 * Basta manager: `preset`, `etapa_alvo_id` e `automatico → assistido` (o
 * caminho que ACRESCENTA revisão humana).
 */
export interface AlteracaoDaConducao {
  mudou: boolean;
  exigeAdmin: boolean;
  campos: string[];
  modoDe: ModoDaConducao | null;
  modoPara: ModoDaConducao | null;
}

function modoDe(c: ConducaoDaCadencia): ModoDaConducao | null {
  return c.quem_atende === "ia" ? c.modo : null;
}

function instrucaoDe(c: ConducaoDaCadencia): string {
  return c.quem_atende === "ia" ? (c.instrucao ?? "").trim() : "";
}

export function alteracaoDaConducao(de: ConducaoDaCadencia, para: ConducaoDaCadencia): AlteracaoDaConducao {
  const campos: string[] = [];
  let exigeAdmin = false;

  if (de.quem_atende !== para.quem_atende) {
    campos.push("quem_atende");
    exigeAdmin = true;
  }
  if (para.quem_atende === "ia") {
    const antes = de.quem_atende === "ia" ? de : null;
    if (antes?.agent_id !== para.agent_id) {
      campos.push("agent_id");
      exigeAdmin = true;
    }
    if (instrucaoDe(de) !== instrucaoDe(para)) {
      campos.push("instrucao");
      exigeAdmin = true;
    }
    if (antes?.modo !== para.modo) {
      campos.push("modo");
      // Ligar a IA já em automático (vindo de atendente) cai na regra de
      // `quem_atende`; aqui só a troca de assistido para automático.
      if (antes?.modo === "assistido" && para.modo === "automatico") exigeAdmin = true;
    }
    if (antes?.preset !== para.preset) campos.push("preset");
    if (antes?.etapa_alvo_id !== para.etapa_alvo_id) campos.push("etapa_alvo_id");
  }

  return { mudou: campos.length > 0, exigeAdmin, campos, modoDe: modoDe(de), modoPara: modoDe(para) };
}
