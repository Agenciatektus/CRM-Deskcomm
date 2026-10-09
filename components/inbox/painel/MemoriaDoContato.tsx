"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";

import { shortDate } from "./SemLista";
import type { DemandaEncerrada, Fato } from "./tipos";

const DESFECHO_LEGIVEL: Record<string, string> = {
  resolvida: "Resolvida", convertida: "Convertida", nao_procede: "Não procede",
  encerrada_pelo_cliente: "Encerrada pelo cliente", perdida: "Perdida", expirada_sem_resposta: "Expirada sem resposta",
};

/**
 * Fatos duráveis (notas) e o histórico das demandas encerradas.
 *
 * ⚠️ O bloco do fato fica numa linha só com `wrap-anywhere` no `<summary>` e no
 * `<p>`: `tests/unit/inbox-texto-longo-nao-empurra-a-coluna.test.ts` lê ESTA
 * linha. Sem a quebra forçada, uma URL de 200 caracteres num fato abria rolagem
 * horizontal dentro do painel (#1802).
 */
export function MemoriaDoContato({ fatos, historico, carregando }: {
  fatos: Fato[];
  historico: DemandaEncerrada[];
  carregando: boolean;
}) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  return (
    <section data-testid="inbox-memoria">
      <h3 className="text-xs font-semibold">{t("Memória do contato")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("Fatos duráveis registrados nas notas. Pendências pertencem à demanda vigente.")}</p>
      {!carregando && fatos.map((f) => <details key={f.id} className="mt-2 text-xs"><summary className="wrap-anywhere">{f.headline}</summary><p className="mt-1 whitespace-pre-wrap wrap-anywhere">{f.body}</p></details>)}
      {!carregando && fatos.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("Nenhum fato durável registrado.")}</p>}
      {!carregando && historico.length > 0 && <div className="mt-3 text-xs"><h4>{t("Histórico encerrado — sem tarefas pendentes")}</h4>{historico.map((h) => <p key={h.id}>{t(DESFECHO_LEGIVEL[h.desfecho] ?? h.desfecho)}{h.fechada_em ? ` · ${shortDate(h.fechada_em, localeDaData)}` : ""}</p>)}</div>}
    </section>
  );
}
