"use client";

import { useT } from "@/hooks/i18n/useT";
import type { CartaoDaPassagem } from "@/lib/escalacao/cartao-da-passagem";
import { Warning } from "@/lib/ui/icons";

/** As seções. Separado do invólucro porque o estado recolhido reusa exatamente isto. */
export function CorpoDaPassagem({ cartao, tituloId }: { cartao: CartaoDaPassagem; tituloId: string }) {
  const t = useT();

  if (cartao.anonimizada) {
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t("Este contato foi anonimizado a pedido dele. O contexto desta passagem foi apagado.")}
      </p>
    );
  }

  return (
    <>
      <p className="mt-1.5 font-medium" data-testid="passagem-motivo">
        {t(cartao.motivo)}
        {cartao.percebidoPeloJev && <> {t("(percebido pelo Jev)")}</>}
      </p>

      {cartao.clienteQuer !== null && (
        <Secao rotulo={t("O cliente quer")}>
          <p className="whitespace-pre-wrap break-words">{cartao.clienteQuer}</p>
        </Secao>
      )}

      {cartao.tentativas.length > 0 && (
        <Secao rotulo={t("A IA já tentou")}>
          <ol className="list-decimal space-y-0.5 pl-4" data-testid="passagem-tentativas">
            {cartao.tentativas.map((tentativa, i) => (
              <li key={`${tituloId}-t${i}`} className="whitespace-pre-wrap break-words">
                {tentativa.o_que}
                {tentativa.desfecho !== undefined && ` → ${tentativa.desfecho}`}
              </li>
            ))}
          </ol>
        </Secao>
      )}

      {/* Aspas e itálico separam a PALAVRA DO CLIENTE da conclusão da IA. Quem lê
          precisa saber o que foi dito de quem interpretou — é a mitigação de
          injeção pelo histórico levada para a tela, não só para o prompt. */}
      {cartao.falaDoCliente !== null && (
        <Secao rotulo={t("Últimas palavras do cliente")}>
          <blockquote className="whitespace-pre-wrap break-words border-l-2 border-border pl-2 italic">
            {`“${cartao.falaDoCliente}”`}
          </blockquote>
        </Secao>
      )}

      {/* "(confira)" no rótulo, e não numa nota de rodapé: é a IA resumindo, e
          quem vai responder assume o que disser. Esconder a seção quando ela é o
          piso evita o cabeçalho órfão — três linhas para dizer nada. */}
      {cartao.resumo !== null && (
        <Secao rotulo={t("Resumo da IA (confira)")}>
          <p className="whitespace-pre-wrap break-words" data-testid="passagem-resumo">
            {cartao.resumo}
          </p>
        </Secao>
      )}

      {cartao.textoDeQuemPassou !== null && (
        <Secao rotulo={t("Escrito por quem passou")}>
          <p className="whitespace-pre-wrap break-words">{cartao.textoDeQuemPassou}</p>
        </Secao>
      )}

      {cartao.semContexto && !cartao.anonimizada && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("Sem resumo acumulado ainda — a conversa é recente. Role para cima para ver tudo o que foi dito.")}
        </p>
      )}

      {cartao.aviso !== null && (
        <p
          className="mt-2 flex items-start gap-1.5 text-xs"
          data-testid="passagem-aviso-ao-cliente"
        >
          {cartao.aviso.avisado ? (
            <span>{t("O cliente já foi avisado de que uma pessoa vai assumir.")}</span>
          ) : (
            <>
              <Warning size={13} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
              <span>
                {t("O cliente NÃO foi avisado — ele está esperando sem saber.")}
                {cartao.aviso.frase !== null && ` (${t(cartao.aviso.frase)})`}
              </span>
            </>
          )}
        </p>
      )}
    </>
  );
}

function Secao({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-subtle">
        {rotulo}
      </p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
