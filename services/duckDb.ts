import * as duckdb from '@duckdb/duckdb-wasm';

// CDN bundles for DuckDB WASM
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
const PARQUET_FILE = 'synthetic_population_mvp.parquet';
export const S3_PATH = `s3://${BUCKET_NAME}/${PARQUET_FILE}`;


let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;

export const initAndConnect = async () => {
    if (dbInstance) return;

    // Select the best bundle for the browser
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    
    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.DEBUG);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    dbInstance = db;
    connInstance = await dbInstance.connect();

    // Point DuckDB at our public bucket for any "home directory" file lookups
    await connInstance.query(`SET home_directory='https://${S3_ENDPOINT}/${BUCKET_NAME}/'`);

    // DuckDB-WASM bundles httpfs, but we still need to install + load explicitly
    await connInstance.query("INSTALL httpfs;");
    await connInstance.query("LOAD httpfs;");

    // Configure S3 for DigitalOcean Spaces using the connection
    await connInstance.query(`SET s3_region='sfo3'`);
    await connInstance.query(`SET s3_endpoint='${S3_ENDPOINT}'`);
    // For public buckets, no credentials needed.

    // Test connection by reading from the S3 file
    try {
        await connInstance.query(`SELECT count(*) FROM '${S3_PATH}'`);
    } catch (e) {
        console.error("S3 connection test failed:", e);
        throw e; // Rethrow to be caught by the UI
    }
};


export const runQuery = async (query: string) => {
    if (!connInstance) {
        throw new Error("Database not connected");
    }
    
    // Execute query
    const result = await connInstance!.query(query);
    // Convert Arrow table to JSON
    return result.toArray().map((row) => row.toJSON());
};

export const getDbSchema = async () => {
    if (!connInstance) return [];
    const result = await connInstance.query(`DESCRIBE SELECT * FROM '${S3_PATH}'`);
    return result.toArray().map(row => row.toJSON());
};

export const getDbPreview = async () => {
    if (!connInstance) return [];
    // Limit to 5 rows to minimize data transfer on preview
    const result = await connInstance.query(`SELECT * FROM '${S3_PATH}' LIMIT 5`);
    return result.toArray().map(row => row.toJSON());
};

export const getDistinctCBSAs = async () => {
    if (!connInstance) return [];
    // We aggregate population (PWGTP) per CBSA/State chunk.
    const query = `
        SELECT 
            cbsa_id, 
            cbsa_name, 
            STATE as state_fips, 
            SUM(PWGTP)::DOUBLE as pop
        FROM '${S3_PATH}' 
        WHERE cbsa_id IS NOT NULL 
        GROUP BY cbsa_id, cbsa_name, STATE
        ORDER BY pop DESC
    `;
    const result = await connInstance.query(query);
    return result.toArray().map((row) => row.toJSON());
};

export const getAverageWeight = async () => {
    if (!connInstance) return 0;
    try {
        const result = await connInstance.query(`SELECT sum(PWGTP)::DOUBLE / count(*)::DOUBLE as avg_val FROM '${S3_PATH}'`);
        const row = result.toArray()[0].toJSON();
        return Number(row.avg_val) || 0;
    } catch (e) {
        console.error("Failed to calculate average weight", e);
        return 0;
    }
};

export const isDbReady = () => !!dbInstance;
