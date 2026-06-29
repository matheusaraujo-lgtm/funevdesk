const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { appendLog } = require("./config");

const execFileAsync = promisify(execFile);

const PS_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class InputSim {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetSystemMetrics(int nIndex);
}
"@
`;

const MOUSEEVENTF_MOVE = 0x0001;
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

async function runPowerShell(commands) {
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile", "-Command", PS_SCRIPT + commands,
    ], { windowsHide: true, timeout: 3000 });
    return stdout;
  } catch (e) {
    appendLog(`InputSim erro: ${e.message}`);
    throw e;
  }
}

async function simulateMouseMove(x, y, screenW, screenH) {
  const pwsh = `
$sw = [InputSim]::GetSystemMetrics(0); $sh = [InputSim]::GetSystemMetrics(1)
$nx = [Math]::Round((${x} / ${screenW}) * $sw)
$ny = [Math]::Round((${y} / ${screenH}) * $sh)
[InputSim]::SetCursorPos($nx, $ny)
  `;
  await runPowerShell(pwsh);
}

async function simulateMouseDown(button) {
  let flag = MOUSEEVENTF_LEFTDOWN;
  if (button === "right") flag = MOUSEEVENTF_RIGHTDOWN;
  else if (button === "middle") flag = MOUSEEVENTF_MIDDLEDOWN;
  await runPowerShell(`[InputSim]::mouse_event(${flag}, 0, 0, 0, [IntPtr]::Zero)`);
}

async function simulateMouseUp(button) {
  let flag = MOUSEEVENTF_LEFTUP;
  if (button === "right") flag = MOUSEEVENTF_RIGHTUP;
  else if (button === "middle") flag = MOUSEEVENTF_MIDDLEUP;
  await runPowerShell(`[InputSim]::mouse_event(${flag}, 0, 0, 0, [IntPtr]::Zero)`);
}

async function simulateMouseWheel(delta) {
  await runPowerShell(`[InputSim]::mouse_event(${MOUSEEVENTF_WHEEL}, 0, 0, ${delta * 120}, [IntPtr]::Zero)`);
}

async function simulateKeyDown(key, code) {
  const vk = VK_TO_CODE[code?.toLowerCase()] || VK_TO_CODE[key?.toLowerCase()] || key?.toUpperCase()?.charCodeAt(0);
  if (vk) {
    await runPowerShell(`[InputSim]::keybd_event(${vk}, 0, ${KEYEVENTF_KEYDOWN}, [IntPtr]::Zero)`);
  }
}

async function simulateKeyUp(key, code) {
  const vk = VK_TO_CODE[code?.toLowerCase()] || VK_TO_CODE[key?.toLowerCase()] || key?.toUpperCase()?.charCodeAt(0);
  if (vk) {
    await runPowerShell(`[InputSim]::keybd_event(${vk}, 0, ${KEYEVENTF_KEYUP}, [IntPtr]::Zero)`);
  }
}

async function simulateTypeText(text) {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      const vk = VK_TO_CODE[char] || code;
      await runPowerShell(`[InputSim]::keybd_event(${vk}, 0, ${KEYEVENTF_KEYDOWN}, [IntPtr]::Zero); [InputSim]::keybd_event(${vk}, 0, ${KEYEVENTF_KEYUP}, [IntPtr]::Zero)`);
    }
  }
}

async function simulateInput(action, params) {
  try {
    switch (action) {
      case "mouse_move": await simulateMouseMove(params.x, params.y, params.screenW, params.screenH); break;
      case "mouse_down": await simulateMouseDown(params.button); break;
      case "mouse_up": await simulateMouseUp(params.button); break;
      case "mouse_wheel": await simulateMouseWheel(params.delta); break;
      case "key_down": await simulateKeyDown(params.key, params.code); break;
      case "key_up": await simulateKeyUp(params.key, params.code); break;
      case "type_text": await simulateTypeText(params.text); break;
    }
  } catch {
    // best-effort
  }
}

module.exports = { simulateInput };
