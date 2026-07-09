const { spawn } = require("node:child_process");
const { appendLog } = require("./config");

// Injeção de mouse/teclado via Win32. ANTES: cada evento rodava `powershell.exe` + `Add-Type`
// (compila C#), ~300-500ms por evento — inviável para controle em tempo real (mouse "travado").
// AGORA: um ÚNICO processo PowerShell persistente carrega o tipo uma vez e executa comandos
// lidos do stdin em loop. Cada comando (mover/clicar/tecla) é praticamente instantâneo.

const PS_BOOT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class InputSim {
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetSystemMetrics(int nIndex);
}
"@
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line.Length -gt 0) { try { Invoke-Expression $line } catch {} }
}
`;

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const KEYEVENTF_KEYDOWN = 0x0000;
const KEYEVENTF_KEYUP = 0x0002;
const VK_TO_CODE = {
  backspace: 0x08, tab: 0x09, enter: 0x0D, shift: 0x10, ctrl: 0x11, alt: 0x12,
  pause: 0x13, capslock: 0x14, escape: 0x1B, space: 0x20,
  pageup: 0x21, pagedown: 0x22, end: 0x23, home: 0x24,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28,
  printscreen: 0x2C, insert: 0x2D, delete: 0x2E,
  "0": 0x30, "1": 0x31, "2": 0x32, "3": 0x33, "4": 0x34, "5": 0x35, "6": 0x36, "7": 0x37, "8": 0x38, "9": 0x39,
  a: 0x41, b: 0x42, c: 0x43, d: 0x44, e: 0x45, f: 0x46, g: 0x47, h: 0x48, i: 0x49,
  j: 0x4A, k: 0x4B, l: 0x4C, m: 0x4D, n: 0x4E, o: 0x4F, p: 0x50, q: 0x51, r: 0x52,
  s: 0x53, t: 0x54, u: 0x55, v: 0x56, w: 0x57, x: 0x58, y: 0x59, z: 0x5A,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
  f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
  numlock: 0x90, scrolllock: 0x91,
  ";": 0xBA, "=": 0xBB, ",": 0xBC, "-": 0xBD, ".": 0xBE, "/": 0xBF, "`": 0xC0,
  "[": 0xDB, "\\": 0xDC, "]": 0xDD, "'": 0xDE,
};

let ps = null;

function getPs() {
  if (ps && !ps.killed && ps.stdin.writable) return ps;
  ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_BOOT], { windowsHide: true });
  ps.on("error", (e) => { appendLog(`InputSim spawn erro: ${e.message}`); ps = null; });
  ps.on("exit", () => { ps = null; });
  if (ps.stderr) ps.stderr.on("data", () => { /* ignora ruído do PS */ });
  return ps;
}

// Envia uma linha de comando pro PowerShell persistente. Só números/enums nossos entram na
// expressão (coordenadas são arredondadas), então não há injeção via conteúdo do usuário.
function send(cmd) {
  try {
    const proc = getPs();
    if (proc && proc.stdin.writable) proc.stdin.write(cmd + "\n");
  } catch (e) {
    appendLog(`InputSim send erro: ${e.message}`);
    ps = null;
  }
}

function int(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : 0;
}

function simulateMouseMove(x, y, screenW, screenH) {
  const w = int(screenW) || 1;
  const h = int(screenH) || 1;
  send(`[InputSim]::SetCursorPos([Math]::Round((${int(x)}/${w})*[InputSim]::GetSystemMetrics(0)),[Math]::Round((${int(y)}/${h})*[InputSim]::GetSystemMetrics(1)))`);
}

function simulateMouseDown(button) {
  const flag = button === "right" ? MOUSEEVENTF_RIGHTDOWN : button === "middle" ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN;
  send(`[InputSim]::mouse_event(${flag},0,0,0,[IntPtr]::Zero)`);
}

function simulateMouseUp(button) {
  const flag = button === "right" ? MOUSEEVENTF_RIGHTUP : button === "middle" ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP;
  send(`[InputSim]::mouse_event(${flag},0,0,0,[IntPtr]::Zero)`);
}

function simulateMouseWheel(delta) {
  send(`[InputSim]::mouse_event(${MOUSEEVENTF_WHEEL},0,0,${int(delta) * 120},[IntPtr]::Zero)`);
}

// Mapa por e.code (independente de layout) — inclui os MODIFICADORES (Ctrl/Shift/Alt/Win),
// essenciais para atalhos como Ctrl+C / Ctrl+V funcionarem na máquina remota.
const CODE_TO_VK = {
  controlleft: 0x11, controlright: 0x11, shiftleft: 0x10, shiftright: 0x10,
  altleft: 0x12, altright: 0x12, metaleft: 0x5B, metaright: 0x5C,
  enter: 0x0D, numpadenter: 0x0D, backspace: 0x08, tab: 0x09, escape: 0x1B, space: 0x20,
  arrowleft: 0x25, arrowup: 0x26, arrowright: 0x27, arrowdown: 0x28,
  delete: 0x2E, insert: 0x2D, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, capslock: 0x14,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75, f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
  minus: 0xBD, equal: 0xBB, bracketleft: 0xDB, bracketright: 0xDD, backslash: 0xDC,
  semicolon: 0xBA, quote: 0xDE, backquote: 0xC0, comma: 0xBC, period: 0xBE, slash: 0xBF,
};

function vkOf(key, code) {
  const c = (code || "").toLowerCase();
  if (/^key[a-z]$/.test(c)) return c.charCodeAt(3) - 32; // KeyC -> 'C' = 0x43
  if (/^digit[0-9]$/.test(c)) return c.charCodeAt(5); // Digit5 -> '5' = 0x35
  if (/^numpad[0-9]$/.test(c)) return 0x60 + (c.charCodeAt(6) - 48); // Numpad0 = 0x60
  if (CODE_TO_VK[c]) return CODE_TO_VK[c];
  const k = (key || "").toLowerCase();
  if (VK_TO_CODE[k]) return VK_TO_CODE[k];
  return key && key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
}

function simulateKeyDown(key, code) {
  const vk = vkOf(key, code);
  if (vk) send(`[InputSim]::keybd_event(${vk},0,${KEYEVENTF_KEYDOWN},[IntPtr]::Zero)`);
}

function simulateKeyUp(key, code) {
  const vk = vkOf(key, code);
  if (vk) send(`[InputSim]::keybd_event(${vk},0,${KEYEVENTF_KEYUP},[IntPtr]::Zero)`);
}

function simulateTypeText(text) {
  for (const char of String(text)) {
    const c = char.charCodeAt(0);
    if (c >= 32 && c <= 126) {
      const vk = VK_TO_CODE[char] || (char.length === 1 ? char.toUpperCase().charCodeAt(0) : c);
      send(`[InputSim]::keybd_event(${vk},0,${KEYEVENTF_KEYDOWN},[IntPtr]::Zero);[InputSim]::keybd_event(${vk},0,${KEYEVENTF_KEYUP},[IntPtr]::Zero)`);
    }
  }
}

async function simulateInput(action, params) {
  try {
    switch (action) {
      case "mouse_move": simulateMouseMove(params.x, params.y, params.screenW, params.screenH); break;
      case "mouse_down": simulateMouseDown(params.button); break;
      case "mouse_up": simulateMouseUp(params.button); break;
      case "mouse_wheel": simulateMouseWheel(params.delta); break;
      case "key_down": simulateKeyDown(params.key, params.code); break;
      case "key_up": simulateKeyUp(params.key, params.code); break;
      case "type_text": simulateTypeText(params.text); break;
    }
  } catch {
    // best-effort
  }
}

module.exports = { simulateInput };
