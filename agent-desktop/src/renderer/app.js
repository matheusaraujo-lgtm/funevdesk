// Fallback de exibição apenas. A versão real chega via IPC em status.version
// (derivada do package.json empacotado); este valor só aparece se o status falhar.
const EXPECTED_VERSION = "1.2.0";

const STATUS_LABELS = { ABERTO: "Aberto", EM_ATENDIMENTO: "Em atendimento", PENDENTE: "Pendente", RESOLVIDO: "Resolvido" };
const PRIORITY_LABELS = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const STATUS_BADGE = { ABERTO: "badge-aberto", EM_ATENDIMENTO: "badge-ativo", PENDENTE: "badge-aguardando", RESOLVIDO: "badge-resolvido" };

let selectedTicketId = null;
let selectedTicket = null;
let pollTimer = null;
let ready = false;
let agentContext = null;
let ticketsCache = [];
let ticketFilter = "open";
let unreadByTicket = new Map();
let lastNotificationAt = new Date().toISOString();

/* ===== HELPERS ===== */
function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }
// Linha de software: ícone real (quando coletado) + nome + detalhes (versão,
// fabricante, tamanho, data de instalação).
function softwareIconHtml(s) {
  if (s.icon) return `<img class="software-icon-img" src="${escapeHtml(s.icon)}" alt="" />`;
  return `<div class="software-icon">${escapeHtml((s.name || "S")[0].toUpperCase())}</div>`;
}
function softwareRowHtml(s, { detailed = false } = {}) {
  const meta = [];
  if (s.version) meta.push(escapeHtml(s.version));
  if (s.publisher) meta.push(escapeHtml(s.publisher));
  if (detailed && s.sizeMb) meta.push(`${s.sizeMb >= 1024 ? (s.sizeMb / 1024).toFixed(1) + " GB" : s.sizeMb + " MB"}`);
  if (detailed && s.installDate) meta.push(escapeHtml(s.installDate));
  return `<div class="software-item">${softwareIconHtml(s)}<div class="software-info"><span class="software-name">${escapeHtml(s.name)}</span><span class="software-meta">${meta.join(" · ")}</span></div></div>`;
}
function dateShort(v) { try { return new Date(v).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" }); } catch { return ""; } }
// Renderiza o EPP (antivírus decodificado + ameaças reais do Defender) no card.
function renderEpp(inv) {
  const avContainer = $("inv-detail-antivirus");
  if (!avContainer) return;
  const av = inv?.antivirus || [];
  const epp = inv?.epp || null;
  const parts = [];
  const product = epp?.product || av[0]?.name;
  if (product) parts.push(`<span class="inv-tag">${escapeHtml(product)}</span>`);
  const enabled = epp ? epp.realtimeProtection : av[0]?.enabled;
  const upToDate = epp
    ? (epp.signatureAgeDays != null ? epp.signatureAgeDays <= 7 : undefined)
    : av[0]?.upToDate;
  if (enabled != null) parts.push(`<span class="inv-tag ${enabled ? "" : "warn"}">Tempo real: ${enabled ? "ativo" : "desligado"}</span>`);
  const tamper = epp ? epp.tamperProtection : undefined;
  if (tamper != null) parts.push(`<span class="inv-tag ${tamper ? "" : "warn"}">Proteção contra adulteração: ${tamper ? "ativa" : "desligada"}</span>`);
  if (upToDate != null) parts.push(`<span class="inv-tag ${upToDate ? "" : "warn"}">Assinaturas: ${upToDate ? "atualizadas" : "desatualizadas"}</span>`);
  if (!parts.length) parts.push('<span class="inv-tag warn">Não detectado</span>');

  const threats = epp?.threats || [];
  // Banner de saúde consolidado (verde "protegido" / vermelho "em risco"),
  // somando antivírus + tempo real + tamper + assinaturas + ameaças.
  const issues = [];
  if (!product) issues.push("sem antivírus ativo");
  if (enabled === false) issues.push("proteção em tempo real desligada");
  if (tamper === false) issues.push("proteção contra adulteração desligada");
  if (upToDate === false) issues.push("assinaturas desatualizadas");
  if (threats.length) issues.push(`${threats.length} ameaça(s) detectada(s)`);
  const healthHtml = issues.length
    ? `<div class="epp-health risk"><span class="epp-health-dot"></span><div class="epp-health-text"><strong>Em risco</strong><span class="epp-health-sub">${escapeHtml(issues.join(" · "))}</span></div></div>`
    : `<div class="epp-health ok"><span class="epp-health-dot"></span><div class="epp-health-text"><strong>Você está protegido</strong><span class="epp-health-sub">Antivírus ativo e atualizado</span></div></div>`;

  let threatHtml;
  if (threats.length) {
    threatHtml = `<div class="epp-threats"><div class="epp-threats-head"><span class="epp-threats-count">${threats.length}</span> ameaça(s) detectada(s) pelo antivírus</div>` +
      threats.slice(0, 8).map((t) => `<div class="epp-threat"><span class="epp-threat-sev sev-${escapeHtml((t.severity || "").toLowerCase())}">${escapeHtml(t.severity || "—")}</span><div class="epp-threat-info"><span class="epp-threat-name">${escapeHtml(t.name || "Ameaça")}</span><span class="epp-threat-meta">${escapeHtml(t.action || "")}${t.detectedAt ? " · " + escapeHtml(dateShort(t.detectedAt)) : ""}</span></div></div>`).join("") +
      `</div>`;
  } else {
    threatHtml = '<div class="epp-clean">✓ Nenhuma ameaça detectada</div>';
  }
  avContainer.innerHTML = `${healthHtml}<div class="inv-tags">${parts.join("")}</div>${threatHtml}`;
}
function stripHtml(html) { return String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim(); }
function plainText(v) { return v ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""; }
function formatDate(v) { try { return new Date(v).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }); } catch { return ""; } }
function initials(name) { if (!name) return "?"; const p = name.split(/[\s.]+/).filter(Boolean); return ((p[0]||"")[0] + (p[1]||"")[0]).toUpperCase(); }
function timeAgo(date) {
  if (!date) return "Nunca";
  const min = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h/24)}d`;
}
function uptimeString() {
  const s = Math.floor((Date.now() - performance.timeOrigin) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d} dia${d > 1 ? "s" : ""}`);
  if (h) parts.push(`${h} hora${h > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} min`);
  return parts.join(", ") || "menos de 1 min";
}
function resolveLogoUrl(logo, server) {
  if (!logo) return "";
  if (logo.startsWith("http")) return logo;
  if (logo.startsWith("/") && server) return server.replace(/\/$/, "") + logo;
  return logo;
}

/* ===== BRANDING ===== */
function applyBranding(branding, serverUrl) {
  const name = branding?.appName || "FunevDesk";
  const version = branding?.version || EXPECTED_VERSION;
  const nameEl = $("app-name");
  if (nameEl) nameEl.textContent = name;
  document.title = `${name} — Agente de Suporte`;
  const tbText = document.querySelector(".titlebar-text");
  if (tbText) tbText.textContent = `${name} — Agente de Suporte`;
  if (branding?.primaryColor) document.documentElement.style.setProperty("--brand", branding.primaryColor);
  const logo = resolveLogoUrl(branding?.logoUrl, serverUrl);
  const logoEl = $("brand-logo");
  if (logoEl) {
    // Logo do servidor quando houver; senão, o ícone empacotado do app (FunevDesk).
    logoEl.alt = name;
    logoEl.classList.remove("hidden");
    if (logo) { logoEl.src = logo; logoEl.onerror = () => { logoEl.src = "app-icon.ico"; logoEl.onerror = null; }; }
    else logoEl.src = "app-icon.ico";
  }
}

/* ===== STATUS ===== */
async function loadStatus() {
  const statusEl = $("status-line");
  const statusText = statusEl?.querySelector(".status-text");
  const statusDot = statusEl?.querySelector(".status-dot");
  try {
    if (statusText) statusText.textContent = "Conectando ao servidor…";
    await Promise.race([
      window.nexusAgent.waitUntilReady(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 45000)),
    ]);
    ready = true;
    const status = await window.nexusAgent.getStatus();
    applyBranding({ appName: status.appName, logoUrl: status.logoUrl, primaryColor: status.primaryColor, version: status.version }, status.serverUrl);
    const ver = $("inv-agent-version");
    if (ver) ver.textContent = `v${status.version || EXPECTED_VERSION}`;
    if (status.online) {
      if (statusDot) statusDot.className = "status-dot online";
      if (statusText) statusText.innerHTML = `<span style="color:var(--green);font-weight:600">Online</span> · ${status.serverUrl}`;
      const desc = $("agent-status-desc");
      if (desc) desc.textContent = "Conectado ao servidor";
    } else {
      if (statusDot) statusDot.className = "status-dot offline";
      if (statusText) statusText.innerHTML = `<span style="color:var(--red);font-weight:600">Offline</span> · ${status.serverUrl || "não configurado"}`;
    }
  } catch (e) {
    const msg = String(e.message || e);
    if (statusDot) statusDot.className = "status-dot offline";
    if (statusText) statusText.textContent = msg.includes("timeout") ? "Não foi possível conectar ao servidor." : msg;
  }
}

/* ===== VIEWS ===== */
function setActiveView(view) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const map = { tickets: "view-tickets", inventory: "view-inventory" };
  Object.values(map).forEach(id => { const el = $(id); if (el) el.classList.add("hidden"); });
  const target = $(map[view]);
  if (target) target.classList.remove("hidden");
  if (view === "inventory") loadInventoryDetail(false);
}
document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => setActiveView(b.dataset.view)));

/* ===== TOAST ===== */
function showToast(msg, ms = 5000) {
  const t = $("agent-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

/* ===== TICKETS ===== */
function renderTickets(tickets) {
  ticketsCache = tickets;
  const container = $("ticket-cards");
  const countLink = $("ticket-count-link");
  if (countLink) countLink.textContent = `Ver todos (${tickets.length})`;
  if (!container) return;
  if (!tickets.length) {
    container.innerHTML = `<p style="padding:12px;color:var(--text3);font-size:12px">${ticketFilter === "open" ? "Nenhum chamado aberto." : "Nenhum chamado encontrado."}</p>`;
    return;
  }
  container.innerHTML = tickets.map(t => {
    const badge = STATUS_BADGE[t.status] || "badge-aberto";
    const label = STATUS_LABELS[t.status] || t.status;
    const initials_ = initials(t.assignee_name);
    return `<div class="ticket-card${t.id === selectedTicketId ? " selected" : ""}" data-id="${t.id}">
      <div class="ticket-card-top">
        <span class="ticket-number">#${t.number}</span>
        <span class="ticket-badge ${badge}">${escapeHtml(label)}</span>
      </div>
      <div class="ticket-title">${escapeHtml(t.title)}</div>
      <div class="ticket-meta-row">
        <span>Atualizado ${timeAgo(t.updated_at)}</span>
        ${t.assignee_name ? `<span class="ticket-tech"><span class="tech-avatar">${escapeHtml(initials_)}</span>${escapeHtml(t.assignee_name)}</span>` : ""}
      </div>
    </div>`;
  }).join("");
  container.querySelectorAll(".ticket-card").forEach(card => {
    card.addEventListener("click", () => {
      const t = tickets.find(x => x.id === card.dataset.id);
      if (t) selectTicket(t);
    });
  });
}

async function loadTickets() {
  if (!ready) return;
  try {
    const tickets = await window.nexusAgent.listTickets(ticketFilter === "all");
    renderTickets(tickets);
    if (selectedTicketId) {
      selectedTicket = tickets.find(t => t.id === selectedTicketId) || selectedTicket;
      if (!tickets.some(t => t.id === selectedTicketId) && ticketFilter === "open") {
        selectedTicketId = null;
        selectedTicket = null;
      }
    }
  } catch (e) {
    const c = $("ticket-cards");
    if (c) c.innerHTML = `<p style="padding:12px;color:var(--yellow);font-size:12px">${escapeHtml(e.message)}</p>`;
  }
}

/* ===== MESSAGES ===== */
function setComposerEnabled(enabled) {
  const inp = $("message-input");
  if (inp) inp.disabled = !enabled;
}

function renderChatMessages(messages, currentUserId) {
  const container = $("chat-messages");
  if (!container) return;
  if (!messages.length) {
    container.innerHTML = `<p style="text-align:center;color:var(--text3);font-size:12px;padding:40px 0">Nenhuma mensagem ainda.</p>`;
    return;
  }
  container.innerHTML = messages.map(m => {
    const isOwn = m.author_type === "USER";
    const isSystem = m.type === "SYSTEM" || m.system || m.message_type === "OPENING" || m.message_type === "FORM_RESPONSE";
    if (isSystem) {
      return `<div class="chat-system-msg">${escapeHtml(m.body || m.content || "")}</div>`;
    }
    const cls = isOwn ? "outgoing" : "incoming";
    const author = isOwn ? "Você" : (m.sender_name || m.author_name || "Suporte");
    const time = formatDate(m.created_at);
    const body = stripHtml(m.body || m.content || "");
    return `<div class="chat-bubble ${cls}">
      <div class="chat-bubble-author">${escapeHtml(author)}</div>
      <div>${body}</div>
      <div class="chat-bubble-meta">${time}</div>
    </div>`;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

async function loadMessages() {
  if (!selectedTicketId || !ready) return;
  try {
    const result = await window.nexusAgent.getMessages(selectedTicketId);
    const messages = result.messages || result;
    setComposerEnabled(!result.resolved);
    renderChatMessages(messages, null);
  } catch {}
}

async function selectTicket(ticket) {
  selectedTicketId = ticket.id;
  selectedTicket = ticket;
  renderTickets(ticketsCache);
  // Show chat view, hide empty state
  $("chat-empty")?.classList.add("hidden");
  $("chat-view")?.classList.remove("hidden");
  $("chat-ticket-number").textContent = `#${ticket.number || ticket.id}`;
  $("chat-ticket-title").textContent = ticket.title || "Chamado";
  await loadMessages();
  const inp = $("message-input");
  if (inp) { inp.value = ""; inp.focus(); }
}

/* ===== CONTEXT ===== */
async function loadAgentContext() {
  try {
    agentContext = await window.nexusAgent.getContext();
    if (agentContext.branding) {
      const st = await window.nexusAgent.getStatus().catch(() => ({}));
      applyBranding({ ...agentContext.branding, version: st.version }, st.serverUrl);
    }
    const asset = agentContext.asset || {};
    // Fill sidebar inventory info (elements may or may not exist depending on view)
    const safeSetText = (id, val) => { const el = $(id); if (el) el.textContent = val || "—"; };
    safeSetText("inv-hostname", asset.hostname);
    safeSetText("inv-user", asset.loggedUser);
    safeSetText("inv-ip", asset.ipAddress);
    safeSetText("inv-os", asset.osName);
    safeSetText("inv-cpu", asset.cpuBrand);
    safeSetText("inv-ram", asset.memoryTotalGb ? `${asset.memoryTotalGb} GB` : null);
    safeSetText("inv-disk", asset.diskTotalGb ? `${asset.diskFreeGb || 0}/${asset.diskTotalGb} GB` : null);
    // Fill detail inventory elements
    const tel = asset;
    const setIf = (id, val) => { const el = $(id); if (el) el.textContent = val || "—"; };
    setIf("inv-detail-hostname", tel.hostname);
    setIf("inv-detail-user", tel.loggedUser);
    setIf("inv-detail-ip", tel.ipAddress);
    setIf("inv-detail-os", tel.osName);
    setIf("inv-detail-cpu", tel.cpuBrand);
    setIf("inv-detail-ram", tel.memoryTotalGb ? `${tel.memoryTotalGb} GB` : null);
    setIf("inv-detail-disk", tel.diskTotalGb ? `${tel.diskFreeGb || 0}/${tel.diskTotalGb} GB` : null);
    setIf("inv-detail-uptime", uptimeString());
  } catch {
    // contexto indisponível — sidebar de inventário simplesmente fica com os valores padrão
  }
}

/* ===== INVENTORY (inline) ===== */
function renderInventoryInline(data) {
  const inv = data?.inventory;
  const hw = inv?.hardware || {};
  const st = inv?.storage || {};
  const sw = inv?.installedSoftware || [];
  const tel = data?.telemetry || inv?.telemetry || {};
  // Health bars (tickets view sidebar)
  const cpu = Math.round(Number(tel.cpuPercent || 0));
  const mem = Math.round(Number(tel.memoryPercent || 0));
  const disk = Math.round(Number(tel.diskPercent || 0));
  const setBar = (id, val, textId) => {
    const bar = $(id);
    const txt = $(textId);
    if (bar) {
      bar.style.width = val + "%";
      bar.className = "health-fill " + (val >= 90 ? "red" : val >= 75 ? "orange" : "blue");
    }
    if (txt) txt.textContent = val + "%";
  };
  setBar("health-cpu", cpu, "health-cpu-text");
  setBar("health-mem", mem, "health-mem-text");
  setBar("health-disk", disk, "health-disk-text");
  // Also update inventory detail health bars
  const setBar2 = (barId, pctId, val) => {
    const bar = $(barId);
    const txt = $(pctId);
    if (bar) {
      bar.style.width = val + "%";
      bar.className = "health-fill " + (val >= 90 ? "red" : val >= 75 ? "orange" : "blue");
    }
    if (txt) txt.textContent = val + "%";
  };
  setBar2("inv-health-cpu-bar", "inv-health-cpu-pct", cpu);
  setBar2("inv-health-mem-bar", "inv-health-mem-pct", mem);
  setBar2("inv-health-disk-bar", "inv-health-disk-pct", disk);
  // Extra info
  const safeSet = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  safeSet("inv-cpu", hw.processorName || tel.cpuBrand || $("inv-cpu")?.textContent);
  safeSet("inv-ram", hw.memoryTotalGb ? `${hw.memoryTotalGb} GB` : $("inv-ram")?.textContent);
  safeSet("inv-disk", st.diskTotalGb ? `${st.diskFreeGb || 0}/${st.diskTotalGb} GB` : $("inv-disk")?.textContent);
  safeSet("inv-os", tel.osName || $("inv-os")?.textContent);
  // Agent version
  const ver = $("inv-agent-version");
  if (ver && tel.agentVersion) ver.textContent = tel.agentVersion;
  // Uptime
  safeSet("inv-uptime", uptimeString());
  // Detail elements
  const setIf = (id, val) => { const el = $(id); if (el && val) el.textContent = val; };
  setIf("inv-detail-hostname", tel.hostname);
  setIf("inv-detail-user", tel.loggedUser);
  setIf("inv-detail-ip", tel.ipAddress);
  setIf("inv-detail-os", tel.osName);
  setIf("inv-detail-cpu", hw.processorName || tel.cpuBrand);
  setIf("inv-detail-ram", hw.memoryTotalGb ? `${hw.memoryTotalGb} GB` : null);
  setIf("inv-detail-disk", st.diskTotalGb ? `${st.diskFreeGb || 0}/${st.diskTotalGb} GB` : null);
  setIf("inv-detail-uptime", uptimeString());
  setIf("inv-detail-version", tel.agentVersion);
  // Software list (top 5) — tickets sidebar
  const swList = $("software-list");
  if (swList && sw.length) {
    swList.innerHTML = sw.slice(0, 5).map(s => softwareRowHtml(s)).join("");
  } else if (swList) {
    swList.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:8px 0">Nenhum software coletado ainda.</p>';
  }
  // Software list — inventory detail view
  const swContainer = $("inv-detail-software");
  const swCount = $("inv-sw-count");
  if (swCount) swCount.textContent = sw.length;
  if (swContainer && sw.length) {
    swContainer.innerHTML = sw.slice(0, 50).map(s => softwareRowHtml(s, { detailed: true })).join("");
  }
  // Network — inventory detail
  const ad = inv?.networkAdapters || [];
  const netContainer = $("inv-detail-network");
  if (netContainer && ad.length) {
    netContainer.innerHTML = ad.map(a => `<div class="inv-field"><span class="inv-label">${escapeHtml(a.name)}</span><span class="inv-value">${(a.ipv4 || []).join(", ") || "—"} · ${a.macAddress || ""}</span></div>`).join("");
  }
  // Antivírus / EPP — inventory detail
  renderEpp(inv);
  // Security — inventory detail
  const sec = inv?.security || {};
  const fwEl = $("inv-detail-firewall");
  const blEl = $("inv-detail-bitlocker");
  const upEl = $("inv-detail-updates");
  if (fwEl) fwEl.textContent = sec.firewall?.map(f => `${f.name}: ${f.enabled ? "ativo" : "desativado"}`).join(", ") || "N/D";
  if (blEl) blEl.textContent = sec.bitlocker?.length ? `${sec.bitlocker.length} volume(s)` : "N/D";
  if (upEl) upEl.textContent = sec.pendingUpdates?.length || 0;
}

/* ===== INVENTORY (detail view) ===== */
async function loadInventoryDetail(force) {
  const container = $("inventory-detail-content");
  // New elements
  const hwFields = {
    manufacturer: $("inv-detail-manufacturer"),
    model: $("inv-detail-model"),
    cpu: $("inv-detail-cpu"),
    cores: $("inv-detail-cores"),
    ram: $("inv-detail-ram"),
    disk: $("inv-detail-disk"),
  };
  const sysFields = {
    hostname: $("inv-detail-hostname"),
    user: $("inv-detail-user"),
    ip: $("inv-detail-ip"),
    os: $("inv-detail-os"),
    uptime: $("inv-detail-uptime"),
    version: $("inv-detail-version"),
  };

  try {
    const data = await window.nexusAgent.getInventory(force);
    const inv = data?.inventory;
    const tel = data?.telemetry || inv?.telemetry || {};
    const hw = inv?.hardware || {};
    const st = inv?.storage || {};
    const sw = inv?.installedSoftware || [];
    const av = inv?.antivirus || [];
    const sec = inv?.security || {};
    const ad = inv?.networkAdapters || [];

    // Hardware
    if (hwFields.manufacturer) hwFields.manufacturer.textContent = hw.manufacturer || "—";
    if (hwFields.model) hwFields.model.textContent = hw.model || "—";
    if (hwFields.cpu) hwFields.cpu.textContent = hw.processorName || "—";
    if (hwFields.cores) hwFields.cores.textContent = hw.cpuCores || "—";
    if (hwFields.ram) hwFields.ram.textContent = hw.memoryTotalGb ? `${hw.memoryTotalGb} GB` : "—";
    if (hwFields.disk) hwFields.disk.textContent = st.diskTotalGb ? `${st.diskFreeGb || 0}/${st.diskTotalGb} GB` : "—";

    // System
    if (sysFields.hostname) sysFields.hostname.textContent = tel.hostname || "—";
    if (sysFields.user) sysFields.user.textContent = tel.loggedUser || "—";
    if (sysFields.ip) sysFields.ip.textContent = tel.ipAddress || "—";
    if (sysFields.os) sysFields.os.textContent = tel.osName || "—";
    if (sysFields.uptime) sysFields.uptime.textContent = uptimeString();
    if (sysFields.version) sysFields.version.textContent = tel.agentVersion || "—";

    // Health bars
    const cpu = Math.round(Number(tel.cpuPercent || 0));
    const mem = Math.round(Number(tel.memoryPercent || 0));
    const disk = Math.round(Number(tel.diskPercent || 0));
    const setBar = (barId, pctId, val) => {
      const bar = $(barId);
      const txt = $(pctId);
      if (bar) {
        bar.style.width = val + "%";
        bar.className = "health-fill " + (val >= 90 ? "red" : val >= 75 ? "orange" : "blue");
      }
      if (txt) txt.textContent = val + "%";
    };
    setBar("inv-health-cpu-bar", "inv-health-cpu-pct", cpu);
    setBar("inv-health-mem-bar", "inv-health-mem-pct", mem);
    setBar("inv-health-disk-bar", "inv-health-disk-pct", disk);

    // Antivírus / EPP
    renderEpp(inv);

    // Security
    const fwEl = $("inv-detail-firewall");
    const blEl = $("inv-detail-bitlocker");
    const upEl = $("inv-detail-updates");
    if (fwEl) fwEl.textContent = sec.firewall?.map(f => `${f.name}: ${f.enabled ? "ativo" : "desativado"}`).join(", ") || "N/D";
    if (blEl) blEl.textContent = sec.bitlocker?.length ? `${sec.bitlocker.length} volume(s)` : "N/D";
    if (upEl) upEl.textContent = sec.pendingUpdates?.length || 0;

    // Software
    const swContainer = $("inv-detail-software");
    const swCount = $("inv-sw-count");
    if (swCount) swCount.textContent = sw.length;
    if (swContainer) {
      if (sw.length) {
        swContainer.innerHTML = sw.slice(0, 50).map(s => softwareRowHtml(s, { detailed: true })).join("");
      } else {
        swContainer.innerHTML = '<p class="inv-empty-text">Nenhum software coletado ainda.</p>';
      }
    }

    // Network
    const netContainer = $("inv-detail-network");
    if (netContainer) {
      if (ad.length) {
        netContainer.innerHTML = ad.map(a => `<div class="inv-field"><span class="inv-label">${escapeHtml(a.name)}</span><span class="inv-value">${(a.ipv4 || []).join(", ") || "—"} · ${a.macAddress || ""}</span></div>`).join("");
      } else {
        netContainer.innerHTML = '<p class="inv-empty-text">Nenhum adaptador coletado.</p>';
      }
    }

    // Legacy container fallback
    if (container) {
      container.innerHTML = `<p style="color:var(--text2);font-size:12px">Inventário carregado. Use os cards ao lado para detalhes.</p>`;
    }
  } catch (e) {
    if (container) container.innerHTML = `<p style="color:var(--text3)">${escapeHtml(e.message)}</p>`;
  }
}
$("refresh-inventory")?.addEventListener("click", () => loadInventoryDetail(true));
$("btn-inventory-top")?.addEventListener("click", () => setActiveView("inventory"));

/* ===== BUSCAR ATUALIZAÇÃO ===== */
$("btn-check-update")?.addEventListener("click", async () => {
  const btn = $("btn-check-update");
  const label = $("btn-update-label");
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add("checking");
  if (label) label.textContent = "Verificando…";
  let result;
  try {
    result = await window.nexusAgent.checkForUpdate();
  } catch {
    result = { status: "error" };
  }
  if (result?.status === "available") {
    if (label) label.textContent = `Baixando v${result.version}…`;
    showToast(`Atualização v${result.version} encontrada. Será instalada automaticamente.`);
    return; // mantém o botão desabilitado; o agente reinicia ao concluir a instalação
  }
  const messages = {
    "up-to-date": "O agente já está na versão mais recente.",
    dev: "Verificação de atualização indisponível em desenvolvimento.",
    "no-server": "Configure o servidor para verificar atualizações.",
    error: "Não foi possível verificar atualizações agora.",
  };
  showToast(messages[result?.status] || messages.error);
  btn.disabled = false;
  btn.classList.remove("checking");
  if (label) label.textContent = "Buscar atualização";
});

/* ===== NOTIFICATIONS ===== */
async function pollNotifications() {
  if (!ready) return;
  try {
    const notifs = await window.nexusAgent.getNotifications(lastNotificationAt);
    if (!notifs.length) return;
    for (const n of notifs) {
      lastNotificationAt = n.createdAt;
      if (n.ticketId !== selectedTicketId) unreadByTicket.set(n.ticketId, (unreadByTicket.get(n.ticketId) || 0) + 1);
    }
    renderTickets(ticketsCache);
    const latest = notifs[notifs.length - 1];
    if (latest.ticketId !== selectedTicketId) {
      showToast(`${latest.title}: ${plainText(latest.body).slice(0, 120)}`);
    }
  } catch {}
}

/* ===== MESSAGES (in ticket detail) ===== */
// For simplicity, messages are handled via the old approach — keeping IPC working
/* eslint-disable no-unused-vars */
async function loadTicketMessages() { await loadMessages(); }

/* ===== REMOTE ACK ===== */
/* ===== WINDOW CONTROLS ===== */
$("win-minimize")?.addEventListener("click", () => window.nexusAgent.minimizeWindow());
$("win-maximize")?.addEventListener("click", () => window.nexusAgent.maximizeWindow());
$("win-close")?.addEventListener("click", () => window.nexusAgent.closeWindow());

/* ===== ORPHANED LINKS ===== */
$("ticket-count-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  ticketFilter = ticketFilter === "all" ? "open" : "all";
  const link = $("ticket-count-link");
  if (link) link.textContent = ticketFilter === "all" ? "Abertos" : `Ver todos (${ticketsCache.length})`;
  loadTickets();
});
$("view-all-activities")?.addEventListener("click", (e) => {
  e.preventDefault();
  showToast("Histórico completo de atividades disponível no portal web.");
});
$("software-view-all")?.addEventListener("click", (e) => {
  e.preventDefault();
  setActiveView("inventory");
});

/* ===== MESSAGE COMPOSER ===== */
$("btn-send-reply")?.addEventListener("click", () => sendReply());
$("btn-clear-reply")?.addEventListener("click", () => {
  const inp = $("message-input");
  if (inp) { inp.value = ""; inp.focus(); }
});
$("btn-close-chat")?.addEventListener("click", () => {
  $("chat-view")?.classList.add("hidden");
  $("chat-empty")?.classList.remove("hidden");
  selectedTicketId = null;
  selectedTicket = null;
  renderTickets(ticketsCache);
});
$("message-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendReply();
  }
});

async function sendReply() {
  const inp = $("message-input");
  if (!inp || !selectedTicketId || !ready) return;
  const body = inp.value.trim();
  if (!body) return;
  const btn = $("btn-send-reply");
  try {
    if (btn) btn.disabled = true;
    await window.nexusAgent.sendMessage(selectedTicketId, body);
    inp.value = "";
    inp.focus();
    if (btn) btn.disabled = false;
    showToast("Resposta enviada.");
    await loadMessages();
  } catch (e) {
    if (btn) btn.disabled = false;
    showToast(`Erro: ${e.message}`);
  }
}

window.nexusAgent.onOpenTicket?.((ticketId) => {
  if (ticketId) {
    const ticket = ticketsCache.find((t) => t.id === ticketId);
    if (ticket) selectTicket(ticket);
    setActiveView("tickets");
  }
});
window.nexusAgent.onTicketNotification?.((n) => {
  if (n.ticketId !== selectedTicketId) { unreadByTicket.set(n.ticketId, (unreadByTicket.get(n.ticketId) || 0) + 1); renderTickets(ticketsCache); }
  else loadMessages();
});

/* ===== POLLING ===== */
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!ready) {
      try { await Promise.race([window.nexusAgent.waitUntilReady(), new Promise((_,r) => setTimeout(() => r(new Error("")), 12000))]); ready = true; await loadStatus(); } catch { return; }
    }
    await loadTickets();
    await pollMessages();
    await pollNotifications();
  }, 5000);
}

async function pollMessages() {
  if (!selectedTicketId || !ready) return;
  try {
    const result = await window.nexusAgent.getMessages(selectedTicketId);
    const messages = result.messages || result;
    setComposerEnabled(!result.resolved);
    renderChatMessages(messages, null);
  } catch {}
}

/* ===== BOOTSTRAP ===== */
async function bootstrap() {
  setActiveView("tickets");
  await loadStatus();
  await loadTickets();
  await loadAgentContext();
  // Initial inventory load for inline display
  try {
    const d = await window.nexusAgent.getInventory(false);
    console.log("[Nexus] Inventário inicial recebido:", d ? `inventory=${!!d.inventory}, telemetry=${!!d.telemetry}` : "null");
    if (d?.inventoryError) console.warn("[Nexus] Erro inventário:", d.inventoryError);
    renderInventoryInline(d);
    if (!d?.inventory) {
      console.log("[Nexus] Inventário vazio, aguardando 3s e tentando com refresh...");
      setTimeout(async () => {
        try {
          const d2 = await window.nexusAgent.getInventory(true);
          console.log("[Nexus] Retry inventário:", d2 ? `inventory=${!!d2.inventory}` : "null");
          renderInventoryInline(d2);
        } catch (e2) { console.error("[Nexus] Retry falhou:", e2.message); }
      }, 3000);
    }
  } catch (e) {
    console.error("[Nexus] Falha ao carregar inventário inicial:", e.message);
  }
  await pollNotifications();
  startPolling();
}

bootstrap();
