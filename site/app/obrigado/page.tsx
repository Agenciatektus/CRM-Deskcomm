import type { Metadata } from "next";

import { OBRIGADO, linkWhatsapp } from "@/lib/conteudo";

import { BotaoPrimario } from "../_components/Botao";
import { Secao } from "../_components/Secao";

export const metadata: Metadata = {
  title: OBRIGADO.titulo,
  robots: { index: false, follow: false },
};

export default function Obrigado() {
  return (
    <Secao id="obrigado" titulo="obrigado-titulo" largura="leitura" ritmo="m">
      <h1 id="obrigado-titulo" className="m-0 text-[clamp(2rem,4vw,3.2rem)] leading-[1.1] font-bold tracking-tight text-balance">
        {OBRIGADO.titulo}
      </h1>
      <p className="mt-4 mb-0 text-[1.1rem] leading-relaxed text-text-muted">{OBRIGADO.texto}</p>
      <h2 className="mt-10 mb-4 text-[1.25rem] font-bold">{OBRIGADO.passosTitulo}</h2>
      <ol className="m-0 grid list-decimal gap-3 pl-6 text-[1.05rem] leading-relaxed">
        {OBRIGADO.passos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <p className="mt-8 mb-6 leading-relaxed text-text-muted">{OBRIGADO.semConvite}</p>
      <BotaoPrimario href={linkWhatsapp(OBRIGADO.mensagem)} externo>
        {OBRIGADO.botao}
      </BotaoPrimario>
    </Secao>
  );
}
