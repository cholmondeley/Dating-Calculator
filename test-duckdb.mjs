import * as duckdb from '@duckdb/duckdb-wasm';

const JSDELIVR_BUNDLES = {
  mvp: {
    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js',
  },
};

const S3_ENDPOINT = 'sfo3.digitaloceanspaces.com';
const BUCKET_NAME = 'dcalc';
const PARQUET_FILE = 'synthetic_population_mvp_dec22.parquet';
const S3_PATH = `s3://${BUCKET_NAME}/${PARQUET_FILE}`;

async function main() {
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  console.log('bundle', bundle);
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.DEBUG);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  await conn.query("SET s3_region='sfo3'");
  await conn.query(`SET s3_endpoint='${S3_ENDPOINT}'`);
  console.log('running query');
  const res = await conn.query(`SELECT count(*) FROM '${S3_PATH}'`);
  console.log('rows', res.toArray().map(r => r.toJSON()));
}

main().catch(err => {
  console.error('error caught', err);
  console.error('error keys', Object.keys(err || {}));
  console.error('string', String(err));
  console.error('stack', err?.stack);
});
