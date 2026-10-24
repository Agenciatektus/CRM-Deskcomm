import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FAQ, SITE } from "@/lib/conteudo";
import { temSessaoViva } from "@/lib/sessao";

import { CtaFinal, Faq } from "./_components/secoes-fim";
import { Agente, ComoFunciona, Faixa, Funil, Problema } from "./_components/secoes-a";
import { Canais, Implantacao, Radar, Seguranca } from "./_components/secoes-b";
import { Hero } from "./_components/Hero";
import { Movimento } from "./_components/Movimento";

/**
 * Quem já tem sessão no CRM segue direto para o sistema, como o `/` do CRM sempre
 * fez. A LP divide o host com o CRM, então o cookie de sessão chega aqui. O cookie precisa trazer uma sessão
 * que ainda não venceu (ver `lib/sessao.ts`); cookie velho deixa a LP aparecer em vez de
 * cair em `/login`. O `proxy.ts` do CRM valida a sessão de verdade em `/app`.
 *
 * `force-dynamic`: a resposta depende do cookie, então a página não pode ser
 * estática. O HTML continua completo, renderizado no servidor.
 */
export const dynamic = "force-dynamic";

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE.url}/#tektus`,
      name: "Tektus",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE.url}/#produto`,
      name: SITE.nome,
      url: SITE.url,
      description: SITE.descricao,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "pt-BR",
      dateModified: SITE.atualizadoEm,
      publisher: { "@id": `${SITE.url}/#tektus` },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.p,
        acceptedAnswer: { "@type": "Answer", text: f.r },
      })),
    },
  ],
};

export default async function Home() {
  const jar = await cookies();
  if (temSessaoViva(jar.getAll())) redirect("/app");

  return (
    <>
      <Movimento />
      <Hero />
      <Faixa />
      <Problema />
      <ComoFunciona />
      <Agente />
      <Funil />
      <Radar />
      <Canais />
      <Seguranca />
      <Implantacao />
      <Faq />
      <CtaFinal />
      <script
        type="application/ld+json"
        // JSON-LD é dado, não script executável: a CSP não o bloqueia. O conteúdo vem
        // de constantes do próprio código, nunca de entrada do usuário.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
