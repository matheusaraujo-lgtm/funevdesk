using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Principal;
using System.Text;
using System.Windows.Forms;

namespace NexusDesk.AgentSetup;

internal static class Program
{
    private const string Marker = "NXDSZIP";

    private static int Main(string[] args)
    {
        var silent = args.Any(a => a.Equals("/quiet", StringComparison.OrdinalIgnoreCase)
            || a.Equals("/silent", StringComparison.OrdinalIgnoreCase)
            || a.Equals("/S", StringComparison.OrdinalIgnoreCase));

        try
        {
            var exePath = Assembly.GetExecutingAssembly().Location;
            if (string.IsNullOrWhiteSpace(exePath))
                exePath = Process.GetCurrentProcess().MainModule?.FileName ?? throw new InvalidOperationException("Caminho do instalador indisponivel.");

            if (!IsAdministrator())
            {
                var relaunch = new ProcessStartInfo
                {
                    FileName = exePath,
                    Arguments = string.Join(" ", args.Select(a => a.Contains(' ') ? $"\"{a}\"" : a)),
                    UseShellExecute = true,
                    Verb = "runas",
                };
                using var elevated = Process.Start(relaunch);
                return elevated?.WaitForExit() == true ? elevated.ExitCode : 1;
            }

            var payload = ExtractPayload(exePath);
            var tempRoot = Path.Combine(Path.GetTempPath(), "NexusDeskSetup_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempRoot);

            var zipPath = Path.Combine(tempRoot, "payload.zip");
            File.WriteAllBytes(zipPath, payload);
            ZipFile.ExtractToDirectory(zipPath, tempRoot);

            var installScript = Path.Combine(tempRoot, "Install-GPO.ps1");
            if (!File.Exists(installScript))
                throw new FileNotFoundException("Install-GPO.ps1 nao encontrado no pacote.");

            var argList = silent ? "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + installScript + "\" -Silent"
                : "-NoProfile -ExecutionPolicy Bypass -File \"" + installScript + "\"";

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = argList,
                UseShellExecute = false,
                CreateNoWindow = silent,
            };

            using var process = Process.Start(psi) ?? throw new InvalidOperationException("Falha ao iniciar instalacao.");
            process.WaitForExit();
            if (process.ExitCode != 0)
            {
                if (!silent)
                    MessageBox.Show("Instalacao falhou. Veja %TEMP%\\FunevDesk-Install.log", "FunevDesk Agente", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return process.ExitCode;
            }

            if (!silent)
                MessageBox.Show("FunevDesk Agente instalado com sucesso.", "FunevDesk Agente", MessageBoxButtons.OK, MessageBoxIcon.Information);

            return 0;
        }
        catch (Exception ex)
        {
            if (!silent)
                MessageBox.Show("Erro na instalacao: " + ex.Message, "FunevDesk Agente", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static byte[] ExtractPayload(string exePath)
    {
        var data = File.ReadAllBytes(exePath);
        var markerBytes = Encoding.ASCII.GetBytes(Marker);
        var index = IndexOf(data, markerBytes);
        if (index < 0)
            throw new InvalidDataException("Pacote do instalador invalido.");

        var lengthOffset = index + markerBytes.Length;
        if (lengthOffset + 4 > data.Length)
            throw new InvalidDataException("Pacote do instalador corrompido.");

        var zipLength = BitConverter.ToInt32(data, lengthOffset);
        var zipOffset = lengthOffset + 4;
        if (zipLength <= 0 || zipOffset + zipLength > data.Length)
            throw new InvalidDataException("Tamanho do pacote invalido.");

        var zip = new byte[zipLength];
        Buffer.BlockCopy(data, zipOffset, zip, 0, zipLength);
        return zip;
    }

    private static int IndexOf(byte[] haystack, byte[] needle)
    {
        for (var i = 0; i <= haystack.Length - needle.Length; i++)
        {
            var found = true;
            for (var j = 0; j < needle.Length; j++)
            {
                if (haystack[i + j] != needle[j])
                {
                    found = false;
                    break;
                }
            }
            if (found) return i;
        }
        return -1;
    }
}
