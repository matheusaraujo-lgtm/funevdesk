"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Expand, ExternalLink, Keyboard, Minimize2, MousePointer, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RemoteConsoleEmbed({ sessionId, hostname, onClose }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const [status, setStatus] = useState("Conectando…");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlMode, setControlMode] = useState("view"); // "view" | "mouse" | "keyboard"
  const [dcOpen, setDcOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const lastSignalAtRef = useRef("");
  const pollingRef = useRef(false);
  const stoppedRef = useRef(false);
  const [ended, setEnded] = useState("");
  const videoSizeRef = useRef({ w: 1920, h: 1080 });

  const sendControl = useCallback((msg) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const pollAgentSignals = useCallback(async (pc) => {
    if (pollingRef.current || stoppedRef.current) return;
    pollingRef.current = true;
    try {
      const query = lastSignalAtRef.current ? `?since=${encodeURIComponent(lastSignalAtRef.current)}` : "";
      const response = await fetch(`/api/remote/sessions/${sessionId}/signal${query}`, { cache: "no-store" });
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
        } else if (payload.type === "denied" || payload.type === "ended") {
          // O colaborador recusou (ou encerrou) — para o polling e mostra o aviso no console.
          setEnded(payload.reason || (payload.type === "denied" ? "O colaborador recusou o acesso remoto." : "Sessão encerrada."));
          setStatus(payload.type === "denied" ? "Recusado" : "Encerrado");
          stoppedRef.current = true;
          try { pcRef.current?.close(); } catch { /* ignore */ }
        }
      }
    } finally {
      pollingRef.current = false;
    }
  }, [sessionId]);

  // Mouse events on video
  function getVideoCoords(e) {
    const video = videoRef.current;
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    const scaleX = videoSizeRef.current.w / rect.width;
    const scaleY = videoSizeRef.current.h / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
      screenW: videoSizeRef.current.w,
      screenH: videoSizeRef.current.h,
    };
  }

  function handleMouseMove(e) {
    if (controlMode !== "mouse") return;
    const coords = getVideoCoords(e);
    if (coords) sendControl({ type: "mouse_move", ...coords });
  }

  function handleMouseDown(e) {
    if (controlMode !== "mouse") return;
    e.preventDefault();
    const coords = getVideoCoords(e);
    if (coords) sendControl({ type: "mouse_move", ...coords });
    const btn = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    sendControl({ type: "mouse_down", button: btn });
  }

  function handleMouseUp(e) {
    if (controlMode !== "mouse") return;
    const btn = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    sendControl({ type: "mouse_up", button: btn });
  }

  function handleWheel(e) {
    if (controlMode !== "mouse") return;
    e.preventDefault();
    sendControl({ type: "mouse_wheel", delta: e.deltaY > 0 ? -1 : 1 });
  }

  function handleKeyDown(e) {
    if (controlMode !== "keyboard") return;
    e.preventDefault();
    sendControl({ type: "key_down", key: e.key, code: e.code });
  }

  function handleKeyUp(e) {
    if (controlMode !== "keyboard") return;
    e.preventDefault();
    sendControl({ type: "key_up", key: e.key, code: e.code });
  }

  function sendText() {
    if (!textInput.trim()) return;
    sendControl({ type: "type_text", text: textInput });
    setTextInput("");
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      sendControl({
        type: "file_upload",
        name: file.name,
        size: file.size,
        data: base64,
      });
      setStatus(`Enviando ${file.name}...`);
    };
    reader.readAsDataURL(file);
  }

  // Key event listener on the container
  useEffect(() => {
    if (controlMode !== "keyboard") return;
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("keyup", handleKeyUp);
    return () => {
      el.removeEventListener("keydown", handleKeyDown);
      el.removeEventListener("keyup", handleKeyUp);
    };
  }, [controlMode]);

  // Fullscreen listener
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // WebRTC setup
  useEffect(() => {
    let stopped = false;
    let pollTimer;
    stoppedRef.current = false;
    setEnded("");

    async function start() {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            const track = event.streams[0].getVideoTracks()[0];
            if (track) {
              const settings = track.getSettings();
              videoSizeRef.current = { w: settings.width || 1920, h: settings.height || 1080 };
            }
          }
        };

        pc.onicecandidate = async (event) => {
          if (!event.candidate) return;
          await fetch(`/api/remote/sessions/${sessionId}/signal`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ type: "ice", candidate: event.candidate }),
          });
        };

        function bindControlChannel(dc) {
          dcRef.current = dc;
          dc.onopen = () => { setDcOpen(true); setStatus("Conectado (controles ativos)"); setControlMode("mouse"); };
          dc.onclose = () => { setDcOpen(false); setControlMode("view"); };
        }
        // Compat: agente antigo cria o canal (chega via ondatachannel).
        pc.ondatachannel = (event) => bindControlChannel(event.channel);
        // Padrão canônico: o VIEWER (que faz o offer) cria o canal "control" e o usa.
        // Assim o SDP já negocia os dados (SCTP) e o agente novo apenas escuta (ondatachannel).
        bindControlChannel(pc.createDataChannel("control", { ordered: true }));

        const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
        await pc.setLocalDescription(offer);
        await fetch(`/api/remote/sessions/${sessionId}/signal`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "offer", sdp: offer.sdp }),
        });

        pollTimer = setInterval(() => {
          if (!stopped && pcRef.current) pollAgentSignals(pcRef.current);
        }, 1200);
        await pollAgentSignals(pc);
      } catch (err) {
        setStatus(err.message || "Erro na conexão");
      }
    }

    start();
    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (pcRef.current) pcRef.current.close();
    };
  }, [sessionId, pollAgentSignals]);

  async function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  function openInNewTab() {
    window.open(`/remote/${sessionId}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden rounded-xl border bg-zinc-950 text-white shadow-2xl ${isFullscreen ? "flex h-full flex-col" : ""}`}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-sm">
        <div className="min-w-0">
          <span className="font-medium">Acesso remoto</span>
          {hostname && <span className="ml-2 text-zinc-400">· {hostname}</span>}
          <span className="ml-2 text-zinc-500">({status})</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-8 text-zinc-300 hover:text-white" title="Tela cheia" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-zinc-300 hover:text-white" title="Abrir em nova aba" onClick={openInNewTab}>
            <ExternalLink className="size-4" />
          </Button>
          {onClose && (
            <Button type="button" variant="ghost" size="icon" className="size-8 text-zinc-300 hover:text-white" title="Fechar" onClick={onClose}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Video area */}
      <div className={`relative flex items-center justify-center bg-black p-2 ${isFullscreen ? "flex-1 min-h-0" : "min-h-[320px]"}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          className={`rounded-md ${isFullscreen ? "max-h-full max-w-full" : "max-h-[480px] max-w-full"} ${controlMode === "mouse" ? "cursor-none" : ""}`}
        />
        {ended && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-red-500/15 text-red-400"><X className="size-6" /></span>
            <p className="text-sm font-medium text-white">{ended}</p>
            {onClose && <Button type="button" variant="outline" size="sm" className="mt-1 border-zinc-700 text-zinc-200" onClick={onClose}>Fechar</Button>}
          </div>
        )}
      </div>

      {/* Control toolbar */}
      <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2">
        <Button
          type="button"
          variant={controlMode === "mouse" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs ${controlMode === "mouse" ? "bg-blue-600 hover:bg-blue-700" : "text-zinc-400 hover:text-white"}`}
          onClick={() => setControlMode(controlMode === "mouse" ? "view" : "mouse")}
          disabled={!dcOpen}
          title="Controle do mouse"
        >
          <MousePointer className="size-3 mr-1" />
          Mouse
        </Button>
        <Button
          type="button"
          variant={controlMode === "keyboard" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs ${controlMode === "keyboard" ? "bg-blue-600 hover:bg-blue-700" : "text-zinc-400 hover:text-white"}`}
          onClick={() => setControlMode(controlMode === "keyboard" ? "view" : "keyboard")}
          disabled={!dcOpen}
          title="Controle do teclado"
        >
          <Keyboard className="size-3 mr-1" />
          Teclado
        </Button>

        {controlMode === "keyboard" && (
          <div className="flex items-center gap-1 ml-auto">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendText(); } }}
              placeholder="Digite algo e pressione Enter..."
              className="h-7 rounded bg-zinc-800 border border-zinc-700 px-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-blue-500 w-56"
            />
            <Button type="button" size="sm" className="h-7 text-xs" onClick={sendText}>Enviar</Button>
          </div>
        )}

        <label className={`ml-auto cursor-pointer ${!dcOpen ? "opacity-30 pointer-events-none" : ""}`}>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white" asChild disabled={!dcOpen}>
            <span>
              <Upload className="size-3 mr-1" />
              Arquivo
            </span>
          </Button>
          <input type="file" className="hidden" onChange={handleFileUpload} disabled={!dcOpen} />
        </label>

        {!dcOpen && status !== "Conectando…" && (
          <span className="text-xs text-zinc-500 ml-2">Aguardando canal de controle...</span>
        )}
      </div>
    </div>
  );
}
