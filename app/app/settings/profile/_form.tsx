"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfile } from "@/app/actions/settings/updateProfile";
import { CampoDeFoto } from "@/components/fotos/CampoDeFoto";
import { useT } from "@/hooks/i18n/useT";
import { IDIOMAS_VISIVEIS } from "@/lib/i18n/registro";
import {
  profileSchema,
  SEM_PREFERENCIA_DE_IDIOMA,
  type Locale,
} from "@/lib/schemas/settings";
import { FUSOS_OFERECIDOS } from "@/lib/tempo/fusos";

import { TrocaDeEmail } from "./_troca-de-email";

// A mesma lista de toda tela de fuso — ver `lib/tempo/fusos.ts`.
const TIMEZONES = FUSOS_OFERECIDOS.map((f) => f.codigo);

interface Props {
  email: string;
  /** Endereço novo aguardando confirmação (`auth.users.new_email`), se houver. */
  emailPendente?: string | null;
  initialFullName: string | null;
  initialAvatarUrl: string | null;
  initialLocale: Locale | typeof SEM_PREFERENCIA_DE_IDIOMA;
  initialTimezone: string;
}

/** Iniciais para o disco sem foto: duas palavras do nome, ou o começo do e-mail. */
function iniciais(nome: string, email: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return email.slice(0, 2).toUpperCase();
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}

export function ProfileForm({
  email,
  emailPendente = null,
  initialFullName,
  initialAvatarUrl,
  initialLocale,
  initialTimezone,
}: Props) {
  const t = useT();
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [locale, setLocale] = useState<Locale | typeof SEM_PREFERENCIA_DE_IDIOMA>(initialLocale);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({
      full_name: fullName || null,
      locale,
      timezone,
    });
    if (!parsed.success) {
      toast.error(t("Dados inválidos."));
      return;
    }
    startTransition(async () => {
      const r = await updateProfile(parsed.data);
      if (r.ok) toast.success(t("Perfil atualizado."));
      else toast.error(`${t("Erro")}: ${r.error}`);
    });
  }

  return (
    <div className="max-w-xl space-y-4">
    <Card className="space-y-4 p-6">
      {/* A foto sobe na hora, fora do "Salvar": é arquivo, não campo do formulário. */}
      <CampoDeFoto
        id="avatar"
        rotulo={t("Foto de perfil")}
        rota="/api/v1/perfil/foto"
        campoDaResposta="avatar_url"
        urlInicial={initialAvatarUrl}
        substituto={iniciais(fullName, email)}
        forma="circulo"
      />
    </Card>
    <TrocaDeEmail email={email} pendente={emailPendente} />
    <form onSubmit={handleSubmit}>
      <Card className="space-y-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="full_name">{t("Nome completo")}</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="locale">{t("Idioma")}</Label>
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PREFERENCIA_DE_IDIOMA}>
                  {t("Seguir o idioma da empresa")}
                </SelectItem>
                {/* A lista vem do registro, e só com o que o nível deixa
                    aparecer. Oferecer um idioma que não muda a tela é prometer
                    o que ela não cumpre — `en-US` saiu por isso, e um idioma
                    em construção fica fora pela mesma razão. */}
                {IDIOMAS_VISIVEIS.map(({ codigo, nomeNativo }) => (
                  <SelectItem key={codigo} value={codigo}>
                    {nomeNativo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">{t("Fuso horário")}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex sm:justify-end">
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? t("Salvando…") : t("Salvar")}
          </Button>
        </div>
      </Card>
    </form>
    </div>
  );
}
