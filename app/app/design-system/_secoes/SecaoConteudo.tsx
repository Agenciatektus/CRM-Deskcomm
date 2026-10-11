"use client";

import { EmptyState } from "@/components/empty/EmptyState";
import { AvatarDoContato } from "@/components/inbox/AvatarDoContato";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import type { ChannelSummary } from "@/hooks/inbox/useConversationsRealtime";
import { Tray } from "@/lib/ui/icons";

import { Estados, Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

const PESSOAS = ["Mariana Couto", "Bruno Reis", "Carla Dias", "Diego Alves", "Elisa Prado", "Fabio Nunes"];
const SIGLA = (nome: string) =>
  nome
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

const WHATSAPP = { provider: "waha" } as unknown as ChannelSummary;
const INSTAGRAM = { provider: "instagram" } as unknown as ChannelSummary;

function AvatarComCanal({ nome, canal }: { nome: string; canal: ChannelSummary }) {
  return (
    <div className="relative size-10 shrink-0">
      <AvatarDoContato contato={null} nome={nome} iniciais={SIGLA(nome)} />
      <ChannelLogo
        channel={canal}
        size={12}
        className="absolute -bottom-1 -right-1 size-4.5 rounded-full bg-surface ring-2 ring-surface"
      />
    </div>
  );
}

export function SecaoConteudo({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao id={`conteudo-${tema}`} titulo={t("Cartão, avatar, tabela e estados vazios")}>
      <Exemplo nome="Card" mapa="comp:card" tema={tema}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t("Próximo passo")}</CardTitle>
            <CardDescription>{t("Ligar para confirmar o horário de sábado.")}</CardDescription>
          </CardHeader>
          <CardContent className="text-ui text-text-muted">{t("Prazo: hoje, 14:30")}</CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">{t("Concluir")}</Button>
            <Button size="sm" variant="secondary">
              {t("Reagendar")}
            </Button>
          </CardFooter>
        </Card>
      </Exemplo>
      <Exemplo nome={t("Avatar: sigla e cor por pessoa")} mapa="comp:avatar" tema={tema}>
        <div className="flex flex-wrap gap-3">
          {PESSOAS.map((p) => (
            <AvatarDoContato key={p} contato={null} nome={p} iniciais={SIGLA(p)} />
          ))}
        </div>
      </Exemplo>
      <Exemplo nome={t("Avatar com selo do canal")} mapa="comp:selo-canal" tema={tema}>
        <div className="flex gap-4">
          <AvatarComCanal nome="Mariana Couto" canal={WHATSAPP} />
          <AvatarComCanal nome="Bruno Reis" canal={INSTAGRAM} />
        </div>
      </Exemplo>
      <Exemplo nome={t("Tabela")} mapa="comp:tabela" tema={tema}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Nome")}</TableHead>
              <TableHead>{t("Etapa")}</TableHead>
              <TableHead className="text-right">{t("Valor")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Mariana Couto</TableCell>
              <TableCell>{t("Proposta")}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">R$ 4.800,00</TableCell>
            </TableRow>
            <TableRow data-state="selected">
              <TableCell>Bruno Reis</TableCell>
              <TableCell>{t("Negociação")}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">R$ 1.250,00</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Exemplo>
      <Exemplo nome="Skeleton" mapa="comp:skeleton" tema={tema}>
        <Estados
          itens={[
            {
              rotulo: t("Carregando"),
              no: (
                <div className="flex w-64 items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Exemplo>
      <Exemplo nome={t("Estado vazio (EmptyState)")} mapa="comp:vazio" tema={tema}>
        <EmptyState
          icon={Tray}
          headline={t("Nada por aqui")}
          subcopy={t("A fila mostra primeiro quem espera há mais tempo.")}
          primary={{ label: t("Nova conversa"), onClick: () => undefined }}
        />
      </Exemplo>
    </Secao>
  );
}
