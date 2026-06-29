import dgram from "node:dgram";
import net from "node:net";
import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { isValidHost } from "@/lib/security";
import { translateSupply } from "@/lib/printer-supplies";
import { PRINTER_ERROR_BITS } from "@/lib/printer-events";

const execFileAsync = promisify(execFile);

const FIREWALL_PORTS = {
  SOPHOS: [443, 4444],
  PFSENSE: [443],
  FORTIGATE: [443, 8443],
  GENERICO: [80, 443],
};

const PRINTER_OIDS = [
  { key: "status", oid: "1.3.6.1.2.1.43.5.1.1.1.1" },
  // hrPrinterDetectedErrorState é BITS — lemos os bytes crus (raw) e decodificamos os bits.
  { key: "errors", oid: "1.3.6.1.2.1.25.3.5.1.2.1", raw: true },
  ...[1, 2, 3, 4].flatMap((index) => [
    { key: `supply_${index}_name`, oid: `1.3.6.1.2.1.43.11.1.1.6.1.${index}` },
    { key: `supply_${index}_max`, oid: `1.3.6.1.2.1.43.11.1.1.8.1.${index}` },
    { key: `supply_${index}_level`, oid: `1.3.6.1.2.1.43.11.1.1.9.1.${index}` },
  ]),
];

function parseLatency(output) {
  const match = output.match(/(?:time[=<]|tempo[=<])\s*(\d+(?:[.,]\d+)?)\s*ms/i) || output.match(/M[ée]dia\s*=\s*(\d+)/i);
  if (!match) return null;
  return Math.round(Number(match[1].replace(",", ".")));
}

async function pingHost(ipAddress) {
  const isWindows = os.platform() === "win32";
  const args = isWindows ? ["-n", "1", "-w", "1000", ipAddress] : ["-c", "1", "-W", "1", ipAddress];
  try {
    const { stdout } = await execFileAsync("ping", args, { timeout: 1800, windowsHide: true });
    return { reachable: true, latencyMs: parseLatency(stdout) };
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}`;
    return { reachable: false, latencyMs: parseLatency(output) };
  }
}

function checkTcpPort(host, port, timeoutMs = 1800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open, error = "") => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ port, open, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, "timeout"));
    socket.once("error", (error) => done(false, error.code || error.message));
  });
}

function encodeLength(length) {
  if (length < 128) return Buffer.from([length]);
  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag, value) {
  return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value]);
}

function encodeInteger(value) {
  const bytes = [];
  let current = value;
  do {
    bytes.unshift(current & 0xff);
    current >>= 8;
  } while (current > 0);
  if (bytes[0] & 0x80) bytes.unshift(0);
  return tlv(0x02, Buffer.from(bytes));
}

function encodeOid(oid) {
  const parts = oid.split(".").map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const stack = [part & 0x7f];
    let value = part >> 7;
    while (value > 0) {
      stack.unshift((value & 0x7f) | 0x80);
      value >>= 7;
    }
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function buildSnmpGet(community, oids, version = 0) {
  // version: 0 = SNMP v1, 1 = SNMP v2c (mesmo GET; muda só o byte da versão).
  const varBinds = oids.map(({ oid }) => tlv(0x30, Buffer.concat([encodeOid(oid), tlv(0x05, Buffer.alloc(0))])));
  const pdu = tlv(0xa0, Buffer.concat([encodeInteger(Date.now() % 2147483647), encodeInteger(0), encodeInteger(0), tlv(0x30, Buffer.concat(varBinds))]));
  return tlv(0x30, Buffer.concat([encodeInteger(version), tlv(0x04, Buffer.from(community)), pdu]));
}

function readLength(buffer, offset) {
  const first = buffer[offset];
  if (first < 128) return { length: first, next: offset + 1 };
  const count = first & 0x7f;
  let length = 0;
  for (let i = 0; i < count; i += 1) length = (length << 8) + buffer[offset + 1 + i];
  return { length, next: offset + 1 + count };
}

function parseTlv(buffer, offset = 0, end = buffer.length, items = []) {
  let cursor = offset;
  while (cursor < end) {
    const tag = buffer[cursor++];
    const lengthInfo = readLength(buffer, cursor);
    const start = lengthInfo.next;
    const valueEnd = start + lengthInfo.length;
    const value = buffer.subarray(start, valueEnd);
    items.push({ tag, value });
    if ([0x30, 0xa0, 0xa2].includes(tag)) parseTlv(buffer, start, valueEnd, items);
    cursor = valueEnd;
  }
  return items;
}

function decodeOid(value) {
  if (!value.length) return "";
  const parts = [Math.floor(value[0] / 40), value[0] % 40];
  let current = 0;
  for (const byte of value.subarray(1)) {
    current = (current << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(current);
      current = 0;
    }
  }
  return parts.join(".");
}

function decodeInteger(value) {
  let result = 0;
  for (const byte of value) result = (result << 8) + byte;
  return result;
}

function decodeValue(item) {
  if (!item) return null;
  if (item.tag === 0x02 || item.tag === 0x41 || item.tag === 0x42 || item.tag === 0x43) return decodeInteger(item.value);
  if (item.tag === 0x04) return item.value.toString("utf8").replace(/\0/g, "").trim();
  if (item.tag === 0x03) return item.value.toString("hex");
  return null;
}

async function snmpGet(host, community, oids, version = 0) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const packet = buildSnmpGet(community, oids, version);
    const timeout = setTimeout(() => {
      socket.close();
      resolve({ ok: false, error: "timeout", values: {} });
    }, 2200);

    socket.once("message", (message) => {
      clearTimeout(timeout);
      socket.close();
      const items = parseTlv(message);
      const values = {};
      for (let i = 0; i < items.length - 1; i += 1) {
        if (items[i].tag === 0x06) {
          const oid = decodeOid(items[i].value);
          const source = oids.find((item) => item.oid === oid);
          if (source) values[source.key] = source.raw ? (items[i + 1]?.value?.toString("hex") || "") : decodeValue(items[i + 1]);
        }
      }
      resolve({ ok: true, values });
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      socket.close();
      resolve({ ok: false, error: error.code || error.message, values: {} });
    });
    socket.send(packet, 161, host);
  });
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePorts(device) {
  const configured = safeJson(device.check_ports_json, null);
  if (Array.isArray(configured) && configured.length) return configured.map(Number).filter(Boolean);
  if (device.monitor_type === "SMB") return [445, 139];
  if (device.monitor_type === "FIREWALL") return FIREWALL_PORTS[device.vendor] || FIREWALL_PORTS.GENERICO;
  if (device.monitor_type === "PRINTER") return [9100, 515, 631];
  return [80, 443];
}

// hrPrinterDetectedErrorState (RFC 3805): cada bit é um erro específico (bit 0 = MSB do 1º byte).
// PRINTER_ERROR_BITS (em @/lib/printer-events) é a lista ordenada { key, label } dos bits.
function decodePrinterErrors(hex) {
  if (!hex) return [];
  let bytes;
  try { bytes = Buffer.from(hex, "hex"); } catch { return []; }
  const errors = [];
  for (let i = 0; i < bytes.length; i += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      if (bytes[i] & (0x80 >> bit)) {
        const entry = PRINTER_ERROR_BITS[i * 8 + bit];
        if (entry) errors.push(entry);
      }
    }
  }
  return errors;
}

function printerMetrics(values) {
  const supplies = [1, 2, 3, 4].map((index) => {
    const name = values[`supply_${index}_name`];
    const max = Number(values[`supply_${index}_max`] || 0);
    const level = Number(values[`supply_${index}_level`] || 0);
    if (!name || max <= 0 || level < 0) return null;
    return { name, level, max, percent: Math.max(0, Math.min(100, Math.round((level / max) * 100))) };
  }).filter(Boolean);
  const errors = decodePrinterErrors(values.errors);
  return {
    printerStatus: values.status,
    errors, // [{ key, label }]
    errorState: errors.length ? errors.map((e) => e.label).join(", ") : null,
    supplies,
    lowSupplies: supplies.filter((item) => item.percent <= 15),
  };
}

export async function checkNetworkDevice(device) {
  if (!isValidHost(device.ip_address)) {
    return { status: "OFFLINE", latencyMs: null, reachable: false, metrics: {}, lastError: "Endereço inválido." };
  }
  const ping = await pingHost(device.ip_address);
  const ports = await Promise.all(normalizePorts(device).map((port) => checkTcpPort(device.ip_address, port)));
  const openPorts = ports.filter((port) => port.open).map((port) => port.port);
  const metrics = {
    monitorType: device.monitor_type || "PING",
    vendor: device.vendor || null,
    pingReachable: ping.reachable,
    ports,
    openPorts,
  };
  let status = ping.reachable || openPorts.length ? "ONLINE" : "OFFLINE";
  let lastError = status === "OFFLINE" ? "Sem resposta por ping ou portas monitoradas." : "";

  if (device.monitor_type === "SMB") {
    metrics.smb = { share: device.smb_share || "", available: openPorts.includes(445) || openPorts.includes(139) };
    if (!metrics.smb.available) {
      status = "OFFLINE";
      lastError = "Serviço SMB indisponível nas portas 445/139.";
    }
  }

  if (device.monitor_type === "FIREWALL" && !openPorts.length) {
    status = ping.reachable ? "ALERTA" : "OFFLINE";
    lastError = ping.reachable ? "Firewall responde ping, mas a porta de administração não abriu." : lastError;
  }

  if (device.monitor_type === "PRINTER" && device.snmp_community) {
    const snmp = await snmpGet(device.ip_address, device.snmp_community, PRINTER_OIDS, device.snmp_version === "v2c" ? 1 : 0);
    metrics.snmpOk = snmp.ok;
    metrics.printer = printerMetrics(snmp.values);
    if (!snmp.ok) {
      status = ping.reachable || openPorts.length ? "ALERTA" : "OFFLINE";
      lastError = `SNMP indisponível: ${snmp.error || "sem resposta"}.`;
    } else {
      const parts = [];
      if (metrics.printer.lowSupplies.length) parts.push(`Suprimento baixo: ${metrics.printer.lowSupplies.map((s) => `${translateSupply(s.name)} (${s.percent}%)`).join(", ")}`);
      if (metrics.printer.errorState) parts.push(`Erro: ${metrics.printer.errorState}`);
      if (parts.length) {
        status = "ALERTA";
        lastError = `${parts.join(" · ")}.`;
      }
    }
  }

  if (status === "ONLINE" && ping.latencyMs && ping.latencyMs > 120) {
    status = "ALERTA";
    lastError = "Latência acima de 120 ms.";
  }

  return {
    status,
    latencyMs: ping.latencyMs,
    reachable: status !== "OFFLINE",
    metrics,
    lastError,
  };
}
