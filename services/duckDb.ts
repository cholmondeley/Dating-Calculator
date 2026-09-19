import * as duckdb from '@duckdb/duckdb-wasm';
import { DUCKDB_DATASET_FILE, DUCKDB_REMOTE_URL } from '../constants';

const REQUIRED_EXTENSIONS = ['parquet'] as const;
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

const PARQUET_URL = DUCKDB_REMOTE_URL;
// The parquet is downloaded once and handed to DuckDB as an in-memory file. DuckDB-WASM's HTTP reads are
// synchronous, one small range at a time (~250 ms each from far away), so range-reading a query cost 5-20 s;
// the ~94 MB file downloads in seconds and then every query is local.
export const DATA_SOURCE = `'${DUCKDB_DATASET_FILE}'`;
const CACHE_NAME = 'dcalc-data';   // the file name carries the version, so a new file is a new cache entry

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

// One shared init: callers (and React StrictMode's double-run effects in dev) must not race to build two
// instances, which leaves the connection pointing at an instance where the parquet was never registered.
let initPromise: Promise<void> | null = null;
export const initAndConnect = (onProgress?: LoadProgress) => {
    if (!initPromise) {
        initPromise = doInit(onProgress).catch(err => { initPromise = null; dbInstance = null; connInstance = null; throw err; });
    }
    return initPromise;
};

export type LoadProgress = (loadedBytes: number, totalBytes: number) => void;

/** The parquet bytes: from Cache Storage when this version was fetched before, else downloaded (with progress). */
const fetchDataset = async (onProgress?: LoadProgress): Promise<Uint8Array> => {
    let cache: Cache | null = null;
    try {
        cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(PARQUET_URL);
        if (hit) {
            const buf = new Uint8Array(await hit.arrayBuffer());
            onProgress?.(buf.byteLength, buf.byteLength);
            return buf;
        }
    } catch (err) {
        console.warn('[DuckDB] Cache Storage unavailable; downloading without caching.', err);
        cache = null;
    }

    const res = await fetch(PARQUET_URL);
    if (!res.ok || !res.body) throw new Error(`Dataset download failed: ${res.status} ${res.statusText}`);
    const total = Number(res.headers.get('Content-Length')) || 0;
    const buf = new Uint8Array(total || 0);
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const reader = res.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (total && loaded + value.byteLength <= total) buf.set(value, loaded); else chunks.push(value);
        loaded += value.byteLength;
        onProgress?.(loaded, total || loaded);
    }
    const bytes = chunks.length ? new Uint8Array(await new Blob([buf.subarray(0, total), ...chunks] as BlobPart[]).arrayBuffer()) : buf;

    if (cache) {
        try {
            // drop older versions, keep this one
            for (const req of await cache.keys()) if (req.url !== PARQUET_URL) await cache.delete(req);
            await cache.put(PARQUET_URL, new Response(bytes.slice(), { headers: { 'Content-Type': 'application/octet-stream' } }));
        } catch (err) {
            console.warn('[DuckDB] Could not cache the dataset (storage quota?).', err);
        }
    }
    return bytes;
};

const doInit = async (onProgress?: LoadProgress) => {
    const bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
    const bundleFlavor = getBundleFlavor(bundle);

    // start the download while the engine boots
    const dataset = fetchDataset(onProgress);

    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({ allowUnsignedExtensions: true });
    console.log('[DuckDB] Initialized bundle', bundle.mainModule, 'flavor', bundleFlavor);

    dbInstance = db;
    connInstance = await dbInstance.connect();
    await configureExtensions(bundleFlavor);

    await dbInstance.registerFileBuffer(DUCKDB_DATASET_FILE, await dataset);
    try {
        await connInstance.query(`SELECT count(*) FROM ${DATA_SOURCE}`);
        console.log('[DuckDB] Dataset ready.');
    } catch (e) {
        console.error('[DuckDB] Dataset check failed:', e);
        throw e;
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
    const result = await connInstance.query(`DESCRIBE SELECT * FROM ${DATA_SOURCE}`);
    return result.toArray().map(row => row.toJSON());
};

export const getDbPreview = async () => {
    if (!connInstance) return [];
    // Limit to 5 rows to minimize data transfer on preview
    const result = await connInstance.query(`SELECT * FROM ${DATA_SOURCE} LIMIT 5`);
    return result.toArray().map(row => row.toJSON());
};



export const isDbReady = () => !!dbInstance;
