"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, UserCircle } from "@/lib/ui/icons";
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

interface PersonRow {
  id: string;
  full_name: string;
  email: string | null;
  updated_at: string;
}

export function PeopleListClient() {
  const t = useT();
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/v1/people${qs}`);
    const json = await res.json();
    setRows(Array.isArray(json.data) ? json.data : []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setSaving(true);
    const res = await fetch("/api/v1/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email: email || null }),
    });
    setSaving(false);
    if (res.ok) {
      setCreateOpen(false);
      setFullName("");
      setEmail("");
      void load();
    }
  }

  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Nome")}</TableHead>
          <TableHead>E-mail</TableHead>
          <TableHead>{t("Atualizado")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell>
              <Link className="font-medium hover:underline" href={`/app/people/${p.id}`}>
                {p.full_name}
              </Link>
            </TableCell>
            <TableCell>{p.email || "—"}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(p.updated_at).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo={t("Pessoas")}
        acoesSoNoDesktop
        descricao={t("Decisores e contatos — telefones ficam em Contatos.")}
        acoes={
          <Button className="mb:hidden" onClick={() => setCreateOpen(true)}>
            <Plus size={16} weight="bold" aria-hidden />
            <span>{t("Nova pessoa")}</span>
          </Button>
        }
      />

      <BarraDeFiltros
        busca={{ valor: searchInput, aoMudar: setSearchInput, placeholder: t("Buscar por nome ou e-mail") }}
      />

      <EstadoDaLista
        carregando={loading}
        quantidade={rows.length}
        vazio={<EmptyState icon={UserCircle} headline={t("Nenhuma pessoa ainda.")} />}
      >
        <TabelaOuCartoes
          itens={rows}
          chave={(p) => p.id}
          rotulo={t("Pessoas")}
          tabela={tabela}
          cartao={(p) => (
            <CartaoEmpilhado
              href={`/app/people/${p.id}`}
              titulo={p.full_name}
              apoio={p.email || "—"}
              campos={[{ rotulo: t("Atualizado"), valor: new Date(p.updated_at).toLocaleString() }]}
            />
          )}
        />
      </EstadoDaLista>

      <BotaoDaTela rotulo={t("Nova pessoa")} aoTocar={() => setCreateOpen(true)} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Nova pessoa")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("Nome completo")}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("Cancelar")}
            </Button>
            <Button disabled={!fullName.trim() || saving} onClick={() => void create()}>
              {t("Criar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}
