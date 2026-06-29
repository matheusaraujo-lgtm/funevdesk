const path = require("node:path");
const { Worker, MessageChannel, receiveMessageOnPort } = require("node:worker_threads");

// Ponte síncrona main↔worker: bloqueia a thread principal em Atomics.wait (sem busy-loop)
// enquanto o worker executa a query pg, e drena a resposta com receiveMessageOnPort.
function createSyncBridge(connectionString) {
  const signal = new SharedArrayBuffer(4);
  const flag = new Int32Array(signal);
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(path.join(__dirname, "pg-worker.cjs"), {
    workerData: {
      port: port2,
      signal,
      connectionString,
      ssl: process.env.DATABASE_SSL === "true",
    },
    transferList: [port2],
  });
  worker.on("error", (err) => {
    // Falha fatal no worker: libera qualquer espera pendente.
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0);
    lastWorkerError = err;
  });
  worker.unref();

  let lastWorkerError = null;

  function call(message) {
    if (lastWorkerError) throw lastWorkerError;
    Atomics.store(flag, 0, 0);
    port1.postMessage(message);
    Atomics.wait(flag, 0, 0); // bloqueia até o worker sinalizar conclusão
    const received = receiveMessageOnPort(port1);
    if (!received) {
      throw lastWorkerError || new Error("Worker PostgreSQL não respondeu.");
    }
    const res = received.message;
    if (!res.ok) {
      const error = new Error(res.error?.message || "Erro na query PostgreSQL.");
      if (res.error?.code) error.code = res.error.code;
      throw error;
    }
    return res;
  }

  return {
    query(text, values) {
      return call({ op: "query", text, values });
    },
    close() {
      try { call({ op: "close" }); } catch { /* já encerrado */ }
      worker.terminate();
    },
  };
}

let bridge = null;
function pgQuery(text, values) {
  return bridge.query(text, values);
}

function convertPlaceholders(sql, params) {
  let index = 0;
  const text = sql.replace(/\?/g, () => `$${++index}`);
  return { text, values: params };
}

function translateSqliteFunctions(sql) {
  return sql
    .replace(/datetime\(\s*'now'\s*\)/gi, "(NOW() AT TIME ZONE 'UTC')")
    .replace(/datetime\(\s*sla_due_at\s*,\s*'-1 hour'\s*\)/gi, "(sla_due_at::timestamptz - INTERVAL '1 hour')")
    .replace(
      /datetime\(\s*created_at\s*,\s*'\+'\s*\|\|\s*COALESCE\(\(SELECT sla_hours FROM system_settings WHERE organization_id=tickets\.organization_id\),\s*8\)\s*\|\|\s*' hours'\s*\)/gi,
      "(created_at::timestamptz + (COALESCE((SELECT sla_hours FROM system_settings WHERE organization_id=tickets.organization_id), 8) || ' hours')::interval)"
    )
    .replace(/>\s*sla_due_at\b/gi, "> sla_due_at::timestamptz");
}

function normalizeSql(sql) {
  let normalized = sql.trim();
  const isInsertOrIgnore = /INSERT\s+OR\s+IGNORE/i.test(normalized);
  if (/^PRAGMA\s+foreign_keys\s*=\s*ON/i.test(normalized)) return null;
  if (/^PRAGMA\s+journal_mode/i.test(normalized)) return null;
  normalized = normalized.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
  if (isInsertOrIgnore && /^INSERT\s+INTO/i.test(normalized) && !/ON CONFLICT DO NOTHING/i.test(normalized)) {
    normalized += " ON CONFLICT DO NOTHING";
  }
  // SQLite AUTOINCREMENT -> PostgreSQL SERIAL (coluna inteira auto-incrementada).
  normalized = normalized.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
  // COLLATE NOCASE não existe no PostgreSQL; remove (ordenação fica case-sensitive).
  normalized = normalized.replace(/\s+COLLATE\s+NOCASE/gi, "");
  normalized = translateSqliteFunctions(normalized);
  return normalized;
}

function splitStatements(sql) {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeValue(value) {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const num = Number(value);
    if (Number.isSafeInteger(num)) return num;
  }
  if (typeof value === "string" && /^-?\d+\.\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function normalizeRow(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

class PgStatement {
  constructor(sql) {
    this.originalSql = sql;
    this.sql = normalizeSql(sql);
    const pragmaMatch = sql.match(/PRAGMA\s+table_info\((\w+)\)/i);
    this.pragmaTable = pragmaMatch?.[1] || null;
    // PRAGMA index_list/index_info não têm equivalente direto e só alimentam migrações
    // SQLite-only. No PostgreSQL o schema já nasce correto, então tratamos como vazios.
    this.pragmaEmpty = /PRAGMA\s+index_(list|info)/i.test(sql);
  }

  run(...params) {
    if (this.pragmaTable || this.pragmaEmpty) return { changes: 0, lastInsertRowid: 0 };
    if (!this.sql) return { changes: 0, lastInsertRowid: 0 };
    const query = convertPlaceholders(this.sql, params);
    const result = pgQuery(query.text, query.values);
    return { changes: result.rowCount ?? 0, lastInsertRowid: 0 };
  }

  get(...params) {
    if (this.pragmaTable) {
      const rows = this.all(...params);
      return rows[0];
    }
    if (this.pragmaEmpty) return undefined;
    if (!this.sql) return undefined;
    const query = convertPlaceholders(this.sql, params);
    const result = pgQuery(query.text, query.values);
    return normalizeRow(result.rows[0]);
  }

  all(...params) {
    if (this.pragmaTable) {
      const result = pgQuery(
        `SELECT column_name AS name,
                data_type AS type,
                CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
                column_default AS dflt_value
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
          ORDER BY ordinal_position`,
        [this.pragmaTable]
      );
      return result.rows.map(normalizeRow);
    }
    if (this.pragmaEmpty) return [];
    if (!this.sql) return [];
    const query = convertPlaceholders(this.sql, params);
    const result = pgQuery(query.text, query.values);
    return result.rows.map(normalizeRow);
  }
}

function createPgDatabase(connectionString) {
  bridge = createSyncBridge(connectionString);

  return {
    prepare(sql) {
      return new PgStatement(sql);
    },
    pragma() {
      // SQLite pragmas are no-ops on PostgreSQL.
    },
    exec(sql) {
      for (const statement of splitStatements(sql)) {
        const normalized = normalizeSql(statement);
        if (!normalized) continue;
        pgQuery(normalized, []);
      }
    },
    transaction(fn) {
      // Conexão única no worker → BEGIN/COMMIT/ROLLBACK compartilham a mesma sessão (transação real).
      return (...args) => {
        pgQuery("BEGIN", []);
        try {
          const result = fn(...args);
          pgQuery("COMMIT", []);
          return result;
        } catch (error) {
          pgQuery("ROLLBACK", []);
          throw error;
        }
      };
    },
    close() {
      bridge.close();
    },
  };
}

module.exports = { createPgDatabase };
