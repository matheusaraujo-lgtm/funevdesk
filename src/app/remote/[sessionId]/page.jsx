"use client";

import { use } from "react";
import { RemoteConsoleEmbed } from "@/components/remote-console-embed";

// Página de tela cheia do acesso remoto (aberta pelo botão "abrir em nova aba").
// Reusa o MESMO console do embed (vídeo + mouse/teclado juntos) para não divergir a lógica
// e para o offer ter a mesma estrutura (vídeo + datachannel) — o que evita o erro de
// "m-lines order" que acontecia quando a página criava um offer só de vídeo.
export default function RemoteConsolePage({ params }) {
  const { sessionId } = use(params);
  return (
    <div className="h-screen w-screen bg-zinc-950">
      <RemoteConsoleEmbed sessionId={sessionId} fill />
    </div>
  );
}
