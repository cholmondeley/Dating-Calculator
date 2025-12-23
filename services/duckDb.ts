import * as duckdb from '@duckdb/duckdb-wasm';
import { DUCKDB_DATASET_FILE, DUCKDB_REMOTE_URL } from '../constants';

const REQUIRED_EXTENSIONS = ['httpfs', 'parquet'] as const;
const DUCKDB_VERSION_FALLBACK = 'v1.3.2';

const getBasePath = () => (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '');
const getPublicRoot = () => {
    const base = getBasePath();
    const origin = getOrigin();
    if (!origin) return base || '/';
    if (!base) return origin;
    return `${origin}${base}`;
};

// CDN bundles for DuckDB WASM
const assetPath = (file: string) => {
    const base = getBasePath();
    if (typeof window === 'undefined') {
        return `${base}/${file}`;
    }
    return `${getPublicRoot()}/${file}`;
};

const LOCAL_BUNDLES = {
    mvp: {
        mainModule: assetPath('duckdb/duckdb-mvp.wasm'),
        mainWorker: assetPath('duckdb/duckdb-browser-mvp.worker.js'),
    },
    eh: {
        mainModule: assetPath('duckdb/duckdb-eh.wasm'),
        mainWorker: assetPath('duckdb/duckdb-browser-eh.worker.js'),
    },
};

const PARQUET_FILE = DUCKDB_DATASET_FILE;
const PARQUET_URL = DUCKDB_REMOTE_URL;
export const S3_PATH = PARQUET_FILE;

type BundleFlavor = 'wasm_eh' | 'wasm_mvp';

let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;

const getBundleFlavor = (bundle: duckdb.DuckDBBundle): BundleFlavor =>
    bundle.mainModule?.includes('-eh') ? 'wasm_eh' : 'wasm_mvp';

const getDuckDBVersionTag = async () => {
    if (!dbInstance) return DUCKDB_VERSION_FALLBACK;
    try {
        const version = await dbInstance.getVersion();
        const match = version?.match(/(\d+\.\d+\.\d+)/);
        return match ? `v${match[1]}` : DUCKDB_VERSION_FALLBACK;
    } catch (err) {
        console.warn('[DuckDB] Failed to read version tag, using fallback.', err);
        return DUCKDB_VERSION_FALLBACK;
    }
};

const configureExtensions = async (flavor: BundleFlavor) => {
    if (!connInstance || typeof window === 'undefined') return;
    const versionTag = await getDuckDBVersionTag();
    const repoRoot = `${getPublicRoot()}/duckdb/extensions`;
    const repoWithFlavor = `${repoRoot}/${versionTag}/${flavor}`;

    try {
        console.log('[DuckDB] Setting custom extension repository to', repoRoot);
        await connInstance.query(`SET custom_extension_repository='${repoRoot}'`);
    } catch (err) {
        console.error('[DuckDB] Unable to configure custom extension repository.', err);
        throw err;
    }

    for (const extension of REQUIRED_EXTENSIONS) {
        try {
            await connInstance.query(`INSTALL ${extension}`);
            await connInstance.query(`LOAD ${extension}`);
            console.log(`[DuckDB] Extension "${extension}" installed from ${repoWithFlavor}`);
        } catch (err) {
            console.error(`[DuckDB] Failed to install extension "${extension}"`, err);
            throw err;
        }
    }
};

export const initAndConnect = async () => {
    if (dbInstance) return;

    // Select the best bundle for the browser
    const bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
    const bundleFlavor = getBundleFlavor(bundle);
    
    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.DEBUG);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({ allowUnsignedExtensions: true });
    console.log('[DuckDB] Initialized bundle', bundle.mainModule, 'flavor', bundleFlavor);

    dbInstance = db;
    connInstance = await dbInstance.connect();
    await configureExtensions(bundleFlavor);

    console.log('[DuckDB] Running connectivity test query…');
    // Register remote parquet so DuckDB can stream it via fetch
    await dbInstance.registerFileURL(PARQUET_FILE, PARQUET_URL, duckdb.DuckDBDataProtocol.HTTP, true);

    // Test connection by reading from the registered file
    try {
        await connInstance.query(`SELECT count(*) FROM '${S3_PATH}'`);
        console.log('[DuckDB] Connectivity test succeeded.');
    } catch (e) {
        console.error("[DuckDB] S3 connection test failed:", e);
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
            state as state_fips, 
            SUM(PWGTP)::DOUBLE as pop
        FROM '${S3_PATH}' 
        WHERE cbsa_id IS NOT NULL 
        GROUP BY cbsa_id, cbsa_name, state
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
