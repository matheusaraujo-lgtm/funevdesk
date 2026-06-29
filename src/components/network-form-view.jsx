"use client";

import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Impressoras são geridas na aba própria (Impressoras); aqui só rede/segurança.
const monitorTypes = {
  PING: "Ping / portas",
  SMB: "Servidor SMB",
  FIREWALL: "Firewall",
};

const vendors = {
  GENERICO: "Genérico",
  SOPHOS: "Sophos",
  PFSENSE: "pfSense",
  FORTIGATE: "FortiGate",
};

const defaultPorts = {
  PING: "80,443",
  SMB: "445,139",
  FIREWALL: "443",
  PRINTER: "9100,515,631",
};

const vendorPorts = {
  SOPHOS: "443,4444",
  PFSENSE: "443",
  FORTIGATE: "443,8443",
  GENERICO: "80,443",
};

function parsePorts(value) {
  return value.split(",").map((port) => Number(port.trim())).filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
}

function portsText(item) {
  try {
    const ports = item?.check_ports_json ? JSON.parse(item.check_ports_json) : [];
    return Array.isArray(ports) && ports.length ? ports.join(",") : "";
  } catch {
    return "";
  }
}

export function NetworkFormView({ item, branches, permissions, onCancel, onSaved }) {
  const initialType = item?.monitor_type || "PING";
  const initialVendor = item?.vendor || (initialType === "FIREWALL" ? "GENERICO" : "");
  const [form, setForm] = useState({
    branchId: item?.branch_id || branches[0]?.id || "",
    name: item?.name || "",
    deviceType: item?.device_type || (initialType === "PRINTER" ? "Impressora" : initialType === "SMB" ? "Servidor SMB" : initialType === "FIREWALL" ? "Firewall" : "Dispositivo"),
    monitorType: initialType,
    vendor: initialVendor,
    ipAddress: item?.ip_address || "",
    ports: portsText(item) || (initialType === "FIREWALL" ? vendorPorts[initialVendor] || vendorPorts.GENERICO : defaultPorts[initialType]),
    snmpCommunity: item?.snmp_community || "",
    smbShare: item?.smb_share || "",
    status: item?.status || "DESCONHECIDO",
    latencyMs: item?.latency_ms ?? 0,
    notes: item?.notes || "",
  });
  const [submitting, setSubmitting] = useState(false);

  const portHint = useMemo(() => {
    if (form.monitorType === "SMB") return "445 para SMB moderno; 139 para ambientes legados.";
    if (form.monitorType === "FIREWALL") return "Sophos costuma usar 443/4444; FortiGate 443/8443; pfSense 443.";
    if (form.monitorType === "PRINTER") return "9100/515/631 validam impressão; SNMP 161 é usado para toner e erros.";
    return "Portas TCP que devem estar abertas nesse equipamento.";
  }, [form.monitorType]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeType(monitorType) {
    setForm((current) => ({
      ...current,
      monitorType,
      vendor: monitorType === "FIREWALL" ? current.vendor || "GENERICO" : "",
      deviceType: monitorType === "PRINTER" ? "Impressora" : monitorType === "SMB" ? "Servidor SMB" : monitorType === "FIREWALL" ? "Firewall" : current.deviceType,
      ports: monitorType === "FIREWALL" ? vendorPorts[current.vendor || "GENERICO"] : defaultPorts[monitorType],
    }));
  }

  function changeVendor(vendor) {
    setForm((current) => ({ ...current, vendor, ports: vendorPorts[vendor] || vendorPorts.GENERICO }));
  }

  async function submit(event) {
    event.preventDefault();
    const checkPorts = parsePorts(form.ports);
    if (!checkPorts.length) return toast.error("Informe pelo menos uma porta TCP válida.");
    setSubmitting(true);
    const response = await fetch(item ? `/api/network/${item.id}` : "/api/network", {
      method: item ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branchId: form.branchId,
        name: form.name,
        deviceType: form.deviceType,
        monitorType: form.monitorType,
        vendor: form.vendor,
        ipAddress: form.ipAddress,
        checkPorts,
        snmpCommunity: form.snmpCommunity,
        smbShare: form.smbShare,
        status: form.status,
        latencyMs: Number(form.latencyMs || 0),
        notes: form.notes,
      }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível cadastrar o dispositivo.");
    toast.success(item ? "Monitoramento atualizado." : "Monitoramento cadastrado.");
    onSaved();
    onCancel();
  }

  return (
    <CrudFormLayout
      title={item ? "Editar monitoramento" : "Novo monitoramento"}
      description="Cadastre firewalls Sophos, pfSense, FortiGate, servidores SMB e impressoras com SNMP."
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel={item ? "Salvar alterações" : "Cadastrar monitoramento"}
      submitting={submitting}
      submitDisabled={!permissions.canConfigure}
      icon={Network}>
      <div className="sm:col-span-2"><Label htmlFor="network-branch" className="mb-2 block">Unidade</Label><Select value={form.branchId} onValueChange={(branchId) => update("branchId", branchId)}><SelectTrigger id="network-branch" aria-label="Unidade"><SelectValue>{(value) => branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="network-monitor-type" className="mb-2 block">Perfil</Label><Select value={form.monitorType} onValueChange={changeType}><SelectTrigger id="network-monitor-type" aria-label="Perfil"><SelectValue>{(value) => monitorTypes[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(monitorTypes).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="network-device-type" className="mb-2 block">Tipo exibido</Label><Input id="network-device-type" required value={form.deviceType} onChange={(event) => update("deviceType", event.target.value)} /></div>
      <div className="sm:col-span-2"><Label htmlFor="network-name" className="mb-2 block">Nome</Label><Input id="network-name" required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: FW-FILIAL-03, PRINT-RH-01, FILESERVER" /></div>
      <div><Label htmlFor="network-ip" className="mb-2 block">IP ou hostname</Label><Input id="network-ip" required value={form.ipAddress} onChange={(event) => update("ipAddress", event.target.value)} placeholder="172.16.3.1" /></div>
      <div><Label htmlFor="network-ports" className="mb-2 block">Portas TCP</Label><Input id="network-ports" required value={form.ports} onChange={(event) => update("ports", event.target.value)} placeholder="443,445" /><p className="mt-1 text-[11px] text-muted-foreground">{portHint}</p></div>
      {form.monitorType === "FIREWALL" && <div><Label htmlFor="network-vendor" className="mb-2 block">Fabricante</Label><Select value={form.vendor || "GENERICO"} onValueChange={changeVendor}><SelectTrigger id="network-vendor" aria-label="Fabricante"><SelectValue>{(value) => vendors[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(vendors).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}
      {form.monitorType === "SMB" && <div><Label htmlFor="network-smb-share" className="mb-2 block">Compartilhamento SMB</Label><Input id="network-smb-share" value={form.smbShare} onChange={(event) => update("smbShare", event.target.value)} placeholder="Ex.: financeiro, publico, scan" /></div>}
      {form.monitorType === "PRINTER" && <div><Label htmlFor="network-snmp" className="mb-2 block">Comunidade SNMP</Label><Input id="network-snmp" value={form.snmpCommunity} onChange={(event) => update("snmpCommunity", event.target.value)} placeholder="public" /><p className="mt-1 text-[11px] text-muted-foreground">Necessário para ler toner e erros da impressora.</p></div>}
      <div><Label htmlFor="network-status" className="mb-2 block">Status inicial</Label><Select value={form.status} onValueChange={(status) => update("status", status)}><SelectTrigger id="network-status" aria-label="Status inicial"><SelectValue>{(value) => ({ ONLINE: "Online", ALERTA: "Alerta", OFFLINE: "Offline", DESCONHECIDO: "Desconhecido" }[value])}</SelectValue></SelectTrigger><SelectContent><SelectItem value="DESCONHECIDO">Desconhecido</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="ALERTA">Alerta</SelectItem><SelectItem value="OFFLINE">Offline</SelectItem></SelectContent></Select></div>
      <div><Label htmlFor="network-latency" className="mb-2 block">Latência inicial (ms)</Label><Input id="network-latency" type="number" min="0" value={form.latencyMs} onChange={(event) => update("latencyMs", event.target.value)} /></div>
      <div className="sm:col-span-2"><Label htmlFor="network-notes" className="mb-2 block">Observações</Label><Textarea id="network-notes" rows={4} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Credenciais não são necessárias aqui; monitore por rede/SNMP." /></div>
    </CrudFormLayout>
  );
}
