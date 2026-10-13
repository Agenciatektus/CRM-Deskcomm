"use client";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { invalidarListasDaConversa } from "@/hooks/inbox/cacheDasConversas";
import { aplicarEstadoNoCache } from "@/hooks/inbox/estadoNoCache";

const DEBOUNCE_MS = 1500;

/**
 * Marca a conversa como lida após permanecer em foco (EPIC-03 S-03.10).
 * Só chama a API quando unread > 0 para evitar writes desnecessários.
 */
export function useMarkAsRead(conversationId: string | null, unread: number, marcadaNaoLida = false) {
  const { user } = useAuth();
  const readonly = user.support?.access_mode === "support_readonly";
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate } = useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ data: unknown }>(`/api/v1/conversations/${id}/mark-read`, {}),
    onSuccess: (_data, id) => {
      // 9042: a rota também tira a marca "não lida" de quem leu.
      aplicarEstadoNoCache(qc, id, { marked_unread: false });
      invalidarListasDaConversa(qc, id);
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      // O contador do topo vive em `["conversation-counts", orgId, sufixo]`
      // (useConversationCounts). O casamento por prefixo do react-query compara
      // elemento a elemento: nem `["conversations"]` nem `["conversation", id]`
      // alcançam essa família — era por isso que o negrito sumia e o número
      // ficava parado até recarregar a página. Invalidar a família inteira
      // acompanha também os sufixos que não estão na tela agora.
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });

  // 9042: a marca "não lida" (pessoal) some ao ABRIR a conversa, e só ao abrir:
  // marcar a conversa que já está aberta não pode ser desfeito 1,5 s depois.
  // Por isso o retrato é tirado na TROCA de id (ajuste de estado no render, o
  // padrão do React para "derivar do prop anterior"). Com contador > 0, o
  // mark-read de baixo já limpa a marca; aqui fica o caso sem contador (e o do
  // viewer, que não zera contador: o DELETE é pessoal).
  const desmarcarAoAbrir = marcadaNaoLida && unread <= 0;
  const [abertura, setAbertura] = useState({ id: conversationId, desmarcar: desmarcarAoAbrir });
  if (abertura.id !== conversationId) setAbertura({ id: conversationId, desmarcar: desmarcarAoAbrir });
  const { mutate: desmarcar } = useMutation({
    mutationFn: (id: string) => apiClient.delete<unknown>(`/api/v1/conversations/${id}/mark-unread`),
    onSuccess: (_data, id) => {
      aplicarEstadoNoCache(qc, id, { marked_unread: false });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
  useEffect(() => {
    const id = abertura.id;
    if (readonly || !id || !abertura.desmarcar) return;
    const timer = setTimeout(() => desmarcar(id), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [abertura, desmarcar, readonly]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (readonly || !conversationId || unread <= 0) return;

    timerRef.current = setTimeout(() => {
      mutate(conversationId);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [conversationId, unread, mutate, readonly]);
}
