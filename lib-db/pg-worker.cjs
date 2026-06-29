// Worker de execução síncrona do PostgreSQL.
// Roda em uma thread dedicada: recebe queries pela MessagePort, executa via pg.Client
// (uma única conexão, então as queries serializam e transações funcionam de verdade),
// devolve o resultado e sinaliza a thread principal via Atomics. Substitui o `deasync`
// (busy-loop que prendia o event loop) por um bloqueio real sem gastar CPU.
const { parentPort, workerData } = require("node:worker_threads");
const { Client } = require("pg");

const { port, signal, connectionString, ssl } = workerData;
const flag = new Int32Array(signal);

const client = new Client({
  connectionString,
  ssl: ssl ? { rejectUnauthorized: true } : undefined,
});
let connecting = client.connect();

function notifyDone() {
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
}

port.on("message", async (msg) => {
  try {
    await connecting;
    if (msg.op === "close") {
      await client.end();
      port.postMessage({ ok: true, rows: [], rowCount: 0 });
      notifyDone();
      return;
    }
    const result = await client.query(msg.text, msg.values || []);
    port.postMessage({ ok: true, rows: result.rows, rowCount: result.rowCount });
  } catch (error) {
    port.postMessage({ ok: false, error: { message: error.message, code: error.code } });
  } finally {
    notifyDone();
  }
});

// Sinaliza pronto na inicialização (a thread principal espera a primeira conexão sob demanda).
parentPort?.postMessage({ ready: true });
