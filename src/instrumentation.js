// Executado uma vez no start do servidor (Next.js instrumentation).
// Sobe o agendador de verificação automática das impressoras/rede.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPrinterScheduler } = await import("@/lib/printer-scheduler");
    startPrinterScheduler();
  }
}
