import * as duckdb from '@duckdb/duckdb-wasm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const baseDir = path.dirname(new URL(import.meta.url).pathname);
const distDir = path.resolve(baseDir, 'node_modules/@duckdb/duckdb-wasm/dist');
const mainModuleEh = pathToFileURL(path.join(distDir, 'duckdb-eh.wasm')).toString();
const workerEh = pathToFileURL(path.join(distDir, 'duckdb-browser-eh.worker.js')).toString();
const mainModuleMvp = pathToFileURL(path.join(distDir, 'duckdb-mvp.wasm')).toString();
const workerMvp = pathToFileURL(path.join(distDir, 'duckdb-browser-mvp.worker.js')).toString();
const pthreadWorker = pathToFileURL(path.join(distDir, 'duckdb-browser-coi.pthread.worker.js')).toString();

const MANUAL_BUNDLES = {
  mvp: {
    mainModule: mainModuleMvp,
    mainWorker: workerMvp,
    pthreadWorker,
  },
  eh: {
    mainModule: mainModuleEh,
    mainWorker: workerEh,
    pthreadWorker,
  },
};

const S3_ENDPOINT = 'sfo3.digitaloceanspaces.com';
const S3_PATH = 's3://dcalc/synthetic_population_mvp_dec22.parquet';

async function main() {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  console.log('bundle', bundle);
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.DEBUG);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  await conn.query("SET s3_region='sfo3'");
  await conn.query(`SET s3_endpoint='${S3_ENDPOINT}'`);
  const result = await conn.query(`SELECT count(*) FROM '${S3_PATH}'`);
  console.log(result.toArray().map(r => r.toJSON()));
}

main().catch(err => {
  console.error(err);
  console.error(err?.stack);
  process.exit(1);
});
