import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FAQ, SITE } from "@/lib/conteudo";

import { Agente, Implantacao, Nichos, Seguranca } from "./_components/secoes-meio";
import { CtaFinal, Faq } from "./_components/secoes-fim";
import { ComoFunciona, Hero, Problema } from "./_components/secoes-topo";

/**
 * Quem já tem sessão no CRM segue direto para o sistema, como o `/` do CRM sempre
 * fez. A LP divide o host com o CRM, então o cookie de sessão chega aqui. Basta
 * a PRESENÇA do cookie: o `proxy.ts` do CRM valida a sessão de verdade e, se ela
 * estiver vencida, manda para `/login`.
 *
 * `force-dynamic`: a resposta depende do cookie, então a página não pode ser
 * estática. O HTML continua completo, renderizado no servidor.
 */
export const dynamic = "force-dynamic";

const COOKIE_DE_SESSAO = "sb-deskcomm-auth";

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
  if (jar.getAll().some((c) => c.name.startsWith(COOKIE_DE_SESSAO))) redirect("/app");

  return (
    <>
      <Hero />
      <Problema />
      <ComoFunciona />
      <Agente />
      <Nichos />
      <Implantacao />
      <Seguranca />
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
