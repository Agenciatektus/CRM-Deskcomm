"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/hooks/i18n/useT";
import { Archive, Check, Lock, PencilSimple, Plus, Tag, Trash, X } from "@/lib/ui/icons";
import type { EscopoDeTag, RespostaDeCuradoria, Vocabulario } from "@/lib/schemas/tags";
import {
  apagarTag,
  arquivarTag,
  criarTag,
  mesclarTags,
  renomearTag,
} from "@/app/actions/settings/curarTags";

/**
 * A mensagem de cada recusa, no idioma de quem está olhando.
 *
 * O servidor manda CÓDIGO e a tela traduz — a decisão de `definirClientePelaAgenda`,
 * pelo mesmo motivo: frase pronta no servidor chega em português a quem usa o
 * produto em espanhol.
 */
function mensagemDoErro(erro: string, t: (s: string) => string): string {
  switch (erro) {
    case "destino_ja_existe":
      return t(
        "Já existe uma etiqueta com esse nome. Para juntar as duas, use Mesclar — assim ninguém perde o histórico.",
      );
    case "etiqueta_do_sistema":
      return t(
        "A etiqueta cliente é posta pelo sistema enquanto a regra Clientes pela agenda estiver ligada. Desligue-a em Tipos de agendamento para editá-la aqui.",
      );
    case "sem_permissao":
      return t("Essa ação é de administrador.");
    case "mfa":
      return t("Entre novamente com o código do aplicativo para continuar.");
    case "limite":
      return t("O vocabulário chegou ao limite de 50 etiquetas. Arquive alguma antes.");
    case "nome_invalido":
      return t("Esse nome não vale: use de 1 a 40 caracteres.");
    case "somente_leitura":
      return t("O acompanhamento de suporte é só de leitura.");
    case "tente_de_novo":
      return t("O banco estava ocupado. Tente de novo.");
    default:
      return t("Não consegui salvar essa mudança agora.");
  }
}

interface Props {
  escopo: EscopoDeTag;
  vocabulario: Vocabulario;
  /** Renomear, mesclar e apagar são de admin — o resto da tela é de manager. */
  podeCurar: boolean;
  /** A etiqueta `cliente` está reservada pela regra da agenda? Só no escopo contato. */
  clienteReservada: boolean;
  /** "312 conversas" ou "312 contatos" — o substantivo muda o que o número significa. */
  substantivo: (n: number) => string;
}

export function VocabularioSection({
  escopo,
  vocabulario,
  podeCurar,
  clienteReservada,
  substantivo,
}: Props) {
  const t = useT();
  const [nova, setNova] = useState("");
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [mesclando, setMesclando] = useState<string[]>([]);
  const [apagando, setApagando] = useState<string | null>(null);
  /**
   * Mesclar também pede confirmação, e não é excesso de zelo.
   *
   * Apagar tem aviso porque destrói. Mesclar reescreve `tags` num conjunto
   * potencialmente MAIOR (a união de todas as origens) e também não tem
   * desfazer — no estado medido desta instalação, um clique errado reescreveria
   * 1121 contatos. Duas operações igualmente irreversíveis com graus de atrito
   * diferentes ensinam que uma delas é leve, e é a que pega mais registros.
   */
  const [confirmandoMescla, setConfirmandoMescla] = useState(false);
  const [isPending, startTransition] = useTransition();

  const uso = useMemo(
    () => new Map(vocabulario.em_uso.map((u) => [u.tag, u.n])),
    [vocabulario.em_uso],
  );

  /**
   * AS ÓRFÃS — as que existem no banco e em vocabulário nenhum.
   *
   * São o motivo desta tela. Medido nesta instalação em 18/09: as conversas não
   * tinham etiqueta alguma e os contatos tinham `importado-whatsapp` (1121) e
   * `teste` (1) — nenhuma das duas em lista de sugestão nenhuma, porque o
   * vocabulário de contato não existia. O operador via a palavra na lista de
   * contatos e não tinha o que fazer com ela.
   *
   * É daqui que a curadoria sai: o que a operação de fato usa, esperando ser
   * promovido a canônico ou mesclado numa palavra que já existe.
   */
  const orfas = useMemo(() => {
    const conhecidas = new Set([...vocabulario.canonicas, ...vocabulario.arquivadas]);
    return vocabulario.em_uso.filter((u) => !conhecidas.has(u.tag));
  }, [vocabulario]);

  function reservada(tag: string): boolean {
    return clienteReservada && escopo === "contato" && tag === "cliente";
  }

  function executar(acao: () => Promise<RespostaDeCuradoria>, sucesso: (n: number) => string) {
    startTransition(async () => {
      const r = await acao();
      if (r.ok) {
        toast.success(sucesso(r.registros));
        setRenomeando(null);
        setNomeNovo("");
        setMesclando([]);
        setApagando(null);
        setConfirmandoMescla(false);
        setNova("");
      } else {
        toast.error(mensagemDoErro(r.erro, t));
      }
    });
  }

  function alternarMescla(tag: string) {
    // A reserva vale aqui também. `cliente` nasce em `contacts.tags` pela
    // migration 0262 e NÃO entra no vocabulário canônico, então ela aparece
    // justamente na lista de órfãs — a única com caixa de seleção. Sem esta
    // guarda, a tela ofereceria mesclar a etiqueta que o servidor recusa com
    // `tags_etiqueta_do_sistema`, na etiqueta mais perigosa do produto.
    if (reservada(tag)) return;
    setMesclando((atual) =>
      atual.includes(tag) ? atual.filter((x) => x !== tag) : [...atual, tag],
    );
  }

  /**
   * A mescla precisa de DUAS ou mais: uma sozinha não tem para onde ir. A última
   * marcada é o destino, e a tela diz isso em texto — sem dizer, o operador
   * marcaria três palavras e não saberia qual sobreviveria.
   */
  const destinoDaMescla = mesclando.at(-1) ?? null;
  const origensDaMescla = mesclando.slice(0, -1);

  /**
   * Quantos registros a mescla reescreve, somando as origens.
   *
   * É um TETO e não um número exato: quem tiver duas origens é contado duas
   * vezes aqui, e uma vez só pelo banco. Errar para cima é o lado certo de errar
   * num aviso de operação irreversível — prometer 40 e reescrever 35 assusta
   * menos do que o contrário. A resposta da action traz o número real.
   */
  const registrosDaMescla = origensDaMescla.reduce((soma, tag) => soma + (uso.get(tag) ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* ─── criar (manager) ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs" htmlFor={`nova-${escopo}`}>
            {t("Acrescentar etiqueta")}
          </Label>
          <Input
            id={`nova-${escopo}`}
            value={nova}
            maxLength={40}
            placeholder={t("orçamento")}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nova.trim()) {
                e.preventDefault();
                executar(
                  () => criarTag(escopo, nova),
                  () => t("Etiqueta acrescentada."),
                );
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !nova.trim()}
          onClick={() =>
            executar(
              () => criarTag(escopo, nova),
              () => t("Etiqueta acrescentada."),
            )
          }
        >
          <Plus size={14} aria-hidden className="mr-1" />
          {t("Acrescentar")}
        </Button>
      </div>

      {/* ─── as canônicas ────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold">{t("Sugeridas pelo sistema")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("São as que aparecem como sugestão para quem está atendendo.")}
        </p>
        {vocabulario.canonicas.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            {t("Nenhuma ainda. Acrescente acima, ou promova uma das que já estão em uso.")}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {vocabulario.canonicas.map((tag) => (
              <li key={tag} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {renomeando === tag ? (
                  <>
                    <Input
                      autoFocus
                      value={nomeNovo}
                      maxLength={40}
                      className="h-8 max-w-56 text-sm"
                      aria-label={`${t("Novo nome para")} ${tag}`}
                      onChange={(e) => setNomeNovo(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={isPending || !nomeNovo.trim()}
                      onClick={() =>
                        executar(
                          () => renomearTag(escopo, tag, nomeNovo),
                          (n) =>
                            n > 0
                              ? `${t("Renomeada em")} ${substantivo(n)}.`
                              : t("Renomeada. Nenhum registro usava essa etiqueta."),
                        )
                      }
                    >
                      <Check size={14} aria-hidden />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenomeando(null)}>
                      <X size={14} aria-hidden />
                    </Button>
                  </>
                ) : (
                  <>
                    <Tag size={14} aria-hidden className="text-muted-foreground" />
                    <span className="text-sm">{tag}</span>
                    <Contador n={uso.get(tag) ?? 0} substantivo={substantivo} t={t} />
                    {reservada(tag) && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Lock size={10} aria-hidden />
                        {t("do sistema")}
                      </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {podeCurar && !reservada(tag) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t("Renomear")} ${tag}`}
                          onClick={() => {
                            setRenomeando(tag);
                            setNomeNovo(tag);
                          }}
                        >
                          <PencilSimple size={14} aria-hidden />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${t("Arquivar")} ${tag}`}
                        disabled={isPending}
                        onClick={() =>
                          executar(
                            () => arquivarTag(escopo, tag, true),
                            () => t("Arquivada. Quem já tinha continua tendo."),
                          )
                        }
                      >
                        <Archive size={14} aria-hidden />
                      </Button>
                      {podeCurar && !reservada(tag) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t("Apagar")} ${tag}`}
                          className="text-destructive"
                          onClick={() => setApagando(tag)}
                        >
                          <Trash size={14} aria-hidden />
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── as órfãs: o coração da curadoria ────────────────────────────── */}
      {orfas.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">{t("Em uso, fora da lista")}</h3>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {t(
              "Nasceram do campo livre de quem atende. É o que a equipe realmente escreve — promova as que valem a pena e junte as que são a mesma coisa escrita de dois jeitos.",
            )}
          </p>
          <ul className="mt-3 divide-y divide-border rounded-md border border-dashed border-border">
            {orfas.map((u) => (
              <li key={u.tag} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {podeCurar && (
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={mesclando.includes(u.tag)}
                    disabled={reservada(u.tag)}
                    onChange={() => alternarMescla(u.tag)}
                    aria-label={`${t("Selecionar para mesclar")} ${u.tag}`}
                  />
                )}
                <span className="text-sm">{u.tag}</span>
                <Contador n={u.n} substantivo={substantivo} t={t} />
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      executar(
                        () => criarTag(escopo, u.tag),
                        () => t("Promovida a sugestão."),
                      )
                    }
                  >
                    {t("Promover")}
                  </Button>
                  {podeCurar && !reservada(u.tag) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t("Apagar")} ${u.tag}`}
                      className="text-destructive"
                      onClick={() => setApagando(u.tag)}
                    >
                      <Trash size={14} aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── a barra de mescla, que só existe quando há o que mesclar ────── */}
      {podeCurar && mesclando.length >= 2 && destinoDaMescla && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
          <span className="text-xs">
            {t("Juntar")} <strong>{origensDaMescla.join(", ")}</strong> {t("em")}{" "}
            <strong>{destinoDaMescla}</strong>
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t("(a última marcada é a que fica)")}
          </span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMesclando([])}>
              {t("Cancelar")}
            </Button>
            <Button size="sm" disabled={isPending} onClick={() => setConfirmandoMescla(true)}>
              {t("Mesclar")}
            </Button>
          </div>
        </div>
      )}

      {/* ─── as arquivadas ───────────────────────────────────────────────── */}
      {vocabulario.arquivadas.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">{t("Arquivadas")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Não são mais sugeridas. Quem já tinha continua tendo, e o filtro continua achando.")}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {vocabulario.arquivadas.map((tag) => (
              <li key={tag}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  className="h-7 gap-1 text-xs"
                  onClick={() =>
                    executar(
                      () => arquivarTag(escopo, tag, false),
                      () => t("Voltou a ser sugerida."),
                    )
                  }
                >
                  {tag}
                  <span className="text-muted-foreground">· {t("desarquivar")}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── mesclar: irreversível, logo confirma, com o número na frente ── */}
      <AlertDialog open={confirmandoMescla} onOpenChange={(o) => !o && setConfirmandoMescla(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Juntar em")} {destinoDaMescla}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`${origensDaMescla.join(", ")} ${t("passa a ser")} ${destinoDaMescla}. ${
                registrosDaMescla > 0
                  ? `${t("Isto reescreve")} ${substantivo(registrosDaMescla)}. `
                  : ""
              }${t("Não dá para desfazer.")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() =>
                executar(
                  () => mesclarTags(escopo, origensDaMescla, destinoDaMescla),
                  (n) => `${t("Juntadas em")} ${substantivo(n)}.`,
                )
              }
            >
              {t("Juntar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── apagar: o contador ANTES, não depois ────────────────────────── */}
      <AlertDialog open={apagando !== null} onOpenChange={(o) => !o && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Apagar")} {apagando}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(uso.get(apagando ?? "") ?? 0) > 0
                ? `${t("A etiqueta sai da lista e de")} ${substantivo(uso.get(apagando ?? "") ?? 0)}. ${t("Não dá para desfazer. Se você só quer parar de sugeri-la, arquive.")}`
                : t(
                    "Nenhum registro usa essa etiqueta, então só a lista muda. Não dá para desfazer.",
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() =>
                executar(
                  () => apagarTag(escopo, apagando),
                  (n) =>
                    n > 0
                      ? `${t("Apagada de")} ${substantivo(n)}.`
                      : t("Apagada da lista de sugestões."),
                )
              }
            >
              {t("Apagar mesmo assim")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Zero não é "0 conversas": é "ninguém usa", que é a informação que importa. */
function Contador({
  n,
  substantivo,
  t,
}: {
  n: number;
  substantivo: (n: number) => string;
  t: (s: string) => string;
}) {
  return (
    <span className="text-xs text-muted-foreground">
      {n > 0 ? substantivo(n) : t("sem uso")}
    </span>
  );
}
