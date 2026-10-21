import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina";
import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { SEM_PREFERENCIA_DE_IDIOMA } from "@/lib/schemas/settings";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./_form";

export const dynamic = "force-dynamic";

/** O que `/auth/confirm` devolve depois do link da troca de e-mail. */
const AVISOS_DO_EMAIL: Record<string, { texto: string; tom: "ok" | "erro" }> = {
  trocado: { texto: "E-mail trocado. Use o novo endereço para entrar.", tom: "ok" },
  falta_o_outro: {
    texto: "Confirmação recebida. Falta abrir o link enviado ao outro endereço para concluir a troca.",
    tom: "ok",
  },
  link_invalido: { texto: "O link da troca de e-mail é inválido ou expirou. Peça a troca de novo.", tom: "erro" },
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ email?: string }>;
}) {
  const user = await requireAuth();
  const aviso = AVISOS_DO_EMAIL[(await searchParams)?.email ?? ""] ?? null;
  // O endereço novo PENDENTE (`auth.users.new_email`): fica de fora do AuthUser
  // porque só esta tela pergunta. Falha aqui não derruba a tela — só não avisa.
  const { data: cru } = await (await createClient()).auth.getUser().catch(() => ({ data: { user: null } }));
  const emailPendente = (cru.user as { new_email?: string | null } | null)?.new_email ?? null;
  // `locale` já vem tipado em AuthUser (loadAuthUser lê user_metadata.locale) —
  // o comentário antigo dizia que não vinha; estava desatualizado. `timezone`
  // não está em AuthUser e segue pelo cast do meta, como full_name/avatar_url.
  const meta = user as unknown as {
    full_name: string | null;
    avatar_url: string | null;
    timezone?: string | null;
  };
  // DOIS idiomas nesta tela, e confundi-los seria o defeito:
  //   `user.idioma`  → o que a interface está usando AGORA (já resolvido com a
  //                    organização). É com ele que esta página se traduz.
  //   `user.locale`  → a PREFERÊNCIA da pessoa, que pode estar vazia. É ela que
  //                    o formulário mostra, porque vazio significa "sigo minha
  //                    empresa" e o seletor tem uma opção para isso. Mostrar o
  //                    efetivo aqui faria quem salvasse sem mexer em nada gravar
  //                    uma preferência que ela nunca escolheu — e daí em diante
  //                    a troca de idioma da empresa passaria por cima dela.
  const idioma = user.idioma;
  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo={traduzir("Perfil", idioma)}
        descricao={traduzir("Informações pessoais, foto e e-mail de acesso.", idioma)}
      />
      <SecaoDaPagina>
        {aviso ? (
          <p
            role="status"
            className={
              aviso.tom === "ok"
                ? "max-w-xl rounded-md border border-border bg-success-bg px-4 py-3 text-sm text-success-fg"
                : "max-w-xl rounded-md border border-border bg-error-bg px-4 py-3 text-sm text-error-fg"
            }
          >
            {traduzir(aviso.texto, idioma)}
          </p>
        ) : null}
        <ProfileForm
          email={user.email}
          emailPendente={emailPendente}
          initialFullName={meta.full_name}
          initialAvatarUrl={meta.avatar_url}
          initialLocale={user.locale ? normalizarIdioma(user.locale) : SEM_PREFERENCIA_DE_IDIOMA}
          initialTimezone={meta.timezone ?? "America/Sao_Paulo"}
        />
      </SecaoDaPagina>
    </Pagina>
  );
}
