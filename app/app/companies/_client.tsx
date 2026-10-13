"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Buildings, Plus } from "@/lib/ui/icons";
import { EmptyState } from "@/components/empty";
import {
  BarraDeFiltros,
  BotaoDaTela,
  CabecalhoDaPagina,
  CartaoEmpilhado,
  EstadoDaLista,
  Pagina,
  TabelaOuCartoes,
} from "@/components/pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

interface CompanyRow {
  id: string;
  trade_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  registration_status: string | null;
  enrichment_status: string;
  updated_at: string;
}

export function CompaniesListClient() {
  const t = useT();
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/v1/companies${qs}`);
    const json = await res.json();
    setRows(Array.isArray(json.data) ? json.data : []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/v1/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legal_name: legalName || null,
        trade_name: tradeName || null,
        cnpj: cnpj || null,
        enrich: true,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error?.message ?? t("Não foi possível criar."));
      return;
    }
    setCreateOpen(false);
    setLegalName("");
    setTradeName("");
    setCnpj("");
    void load();
  }

  const nome = (c: CompanyRow) => c.trade_name || c.legal_name || "—";
  const cidade = (c: CompanyRow) => [c.city, c.state].filter(Boolean).join("/") || "—";
  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Nome fantasia")}</TableHead>
          <TableHead>{t("Razão social")}</TableHead>
          <TableHead>CNPJ</TableHead>
          <TableHead>{t("Cidade/UF")}</TableHead>
          <TableHead>{t("Situação")}</TableHead>
          <TableHead>{t("Atualizado")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link className="font-medium underline-offset-2 hover:underline" href={`/app/companies/${c.id}`}>
                {nome(c)}
              </Link>
            </TableCell>
            <TableCell>{c.legal_name || "—"}</TableCell>
            <TableCell className="font-mono text-xs">{c.cnpj || "—"}</TableCell>
            <TableCell>{cidade(c)}</TableCell>
            <TableCell>{c.registration_status || c.enrichment_status}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(c.updated_at).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo={t("Empresas")}
        acoesSoNoDesktop
        descricao={t("Cadastro B2B com CNPJ e enriquecimento via BrasilAPI.")}
        acoes={
          <Button className="mb:hidden" onClick={() => setCreateOpen(true)}>
            <Plus size={16} weight="bold" aria-hidden />
            <span>{t("Nova empresa")}</span>
          </Button>
        }
      />

      <BarraDeFiltros
        busca={{ valor: searchInput, aoMudar: setSearchInput, placeholder: t("Buscar por nome ou CNPJ") }}
      />

      <EstadoDaLista
        carregando={loading}
        quantidade={rows.length}
        vazio={<EmptyState icon={Buildings} headline={t("Nenhuma empresa ainda.")} />}
      >
        <TabelaOuCartoes
          itens={rows}
          chave={(c) => c.id}
          rotulo={t("Empresas")}
          tabela={tabela}
          cartao={(c) => (
            <CartaoEmpilhado
              href={`/app/companies/${c.id}`}
              titulo={nome(c)}
              apoio={c.legal_name || undefined}
              selo={<Badge variant="outline">{c.registration_status || c.enrichment_status}</Badge>}
              campos={[
                { rotulo: "CNPJ", valor: <span className="font-mono">{c.cnpj || "—"}</span> },
                { rotulo: t("Cidade/UF"), valor: cidade(c) },
                { rotulo: t("Atualizado"), valor: new Date(c.updated_at).toLocaleString() },
              ]}
            />
          )}
        />
      </EstadoDaLista>

      <BotaoDaTela rotulo={t("Nova empresa")} aoTocar={() => setCreateOpen(true)} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Nova empresa")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>{t("Razão social")}</Label>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("Nome fantasia")}</Label>
              <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={() => void create()} disabled={saving || (!legalName && !tradeName && !cnpj)}>
              {saving ? t("Salvando…") : t("Criar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}
