"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";

export function PersonDetailClient({ id }: { id: string }) {
  const t = useT();
  const [data, setData] = useState<{
    person: Record<string, unknown>;
    companies: Array<Record<string, unknown>>;
    contacts: Array<Record<string, unknown>>;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/people/${id}`);
    const json = await res.json();
    if (res.ok) setData(json.data);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="text-sm text-muted-foreground mb:px-4 mb:pt-3">{t("Carregando…")}</p>;

  return (
    <Pagina>
      <CabecalhoDaPagina
        tituloNoCelular
        antes={
          <Link href="/app/people" className="text-sm text-muted-foreground hover:underline mb:hidden">
            ← {t("Pessoas")}
          </Link>
        }
        titulo={data.person.full_name as string}
        descricao={(data.person.email as string) || "—"}
      />

      <div className="grid gap-4 md:grid-cols-2 mb:px-4">
        <Card className="space-y-2 p-4">
          <h2 className="font-medium">{t("Empresas")}</h2>
          {data.companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Sem vínculo empresarial.")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.companies.map((l) => {
                const co = l.companies as {
                  id: string;
                  trade_name?: string;
                  legal_name?: string;
                } | null;
                return (
                  <li key={l.id as string}>
                    {co ? (
                      <Link href={`/app/companies/${co.id}`} className="font-medium hover:underline">
                        {co.trade_name || co.legal_name || co.id}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <div className="text-muted-foreground">{(l.job_title as string) || ""}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="space-y-2 p-4">
          <h2 className="font-medium">{t("Telefones (contacts)")}</h2>
          {data.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhum telefone vinculado.")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.contacts.map((ct) => (
                <li key={ct.id as string}>
                  <Link href={`/app/contacts/${ct.id}`} className="font-mono hover:underline">
                    {(ct.phone_number as string) || "—"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Pagina>
  );
}
