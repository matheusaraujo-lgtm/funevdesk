"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";

export default function RemoteConsolePage({ params }) {
  const { sessionId } = use(params);
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const [status, setStatus] = useState("Conectando…");
  const [error, setError] = useState("");
  const lastSignalAtRef = useRef("");
  const pollingRef = useRef(false);
  // Segredo da sessão vem no fragmento da URL (#...) — nunca é enviado ao servidor
  // automaticamente; nós o repassamos explicitamente no header de cada requisição.
  const secretRef = useRef(typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "");
  const secretHeader = useCallback(() => (secretRef.current ? { "x-remote-secret": secretRef.current } : {}), []);

  const pollAgentSignals = useCallback(async (pc) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const query = lastSignalAtRef.current ? `?since=${encodeURIComponent(lastSignalAtRef.current)}` : "";
      const response = await fetch(`/api/remote/sessions/${sessionId}/signal${query}`, { cache: "no-store", headers: { ...secretHeader() } });
      if (!response.ok) return;
      const { signals } = await response.json();
      for (const signal of signals || []) {
        lastSignalAtRef.current = signal.createdAt;
        const payload = signal.payload || {};
        if (payload.type === "answer" && payload.sdp) {
          if (pc.signalingState !== "have-local-offer") continue;
          await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
          setStatus("Transmitindo");
        } else if (payload.type === "ice" && payload.candidate) {
          try { await pc.addIceCandidate(payload.candidate); } catch { /* ignore */ }
        }
      }
    } finally {
      pollingRef.current = false;
    }
  }, [sessionId, secretHeader]);

  useEffect(() => {
    let stopped = false;
    let pollTimer;

    async function start() {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onicecandidate = async (event) => {
          if (!event.candidate) return;
          await fetch(`/api/remote/sessions/${sessionId}/signal`, {
            method: "POST",
            headers: { "content-type": "application/json", ...secretHeader() },
            body: JSON.stringify({ type: "ice", candidate: event.candidate }),
          });
        };

        const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
        await pc.setLocalDescription(offer);
        await fetch(`/api/remote/sessions/${sessionId}/signal`, {
          method: "POST",
          headers: { "content-type": "application/json", ...secretHeader() },
          body: JSON.stringify({ type: "offer", sdp: offer.sdp }),
        });

        pollTimer = setInterval(() => {
          if (!stopped && pcRef.current) pollAgentSignals(pcRef.current);
        }, 1200);
        await pollAgentSignals(pc);
      } catch (err) {
        setError(err.message || "Falha na conexão remota.");
        setStatus("Erro");
      }
    }

    start();
    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (pcRef.current) pcRef.current.close();
    };
  }, [sessionId, pollAgentSignals]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 text-sm">
        <span className="font-medium">FunevDesk · Acesso remoto</span>
        <span className="text-zinc-400">{status}</span>
      </header>
      <main className="flex flex-1 items-center justify-center p-2">
        {error ? (
          <p className="text-red-400">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline className="max-h-[calc(100vh-56px)] max-w-full rounded-lg bg-black shadow-2xl" />
        )}
      </main>
    </div>
  );
}
