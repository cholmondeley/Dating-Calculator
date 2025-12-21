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

let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;

export const initDuckDB = async () => {
    if (dbInstance) return dbInstance;

    // Select the best bundle for the browser
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    
    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    dbInstance = db;
    return db;
};

export const loadDatabaseFromUrl = async (url: string) => {
    if (!dbInstance) await initDuckDB();
    if (!dbInstance) throw new Error("Failed to initialize DB");

    try {
        // Register the remote URL. 
        await dbInstance.registerFileURL(
            'usa_dating_data.parquet', 
            url, 
            duckdb.DuckDBDataProtocol.HTTP, 
            false // strict: false
        );

        // Establish connection now that the file is registered
        if (!connInstance) {
            connInstance = await dbInstance.connect();
        }
        
        return true;
    } catch (error) {
        console.error("Error loading remote database:", error);
        throw error;
    }
};

// Simple test to ensure we can actually read from the file
// This catches CORS errors before we say "Connected"
export const testConnection = async () => {
    if (!connInstance) return false;
    try {
        // Try to read just 1 row from a known lightweight column or metadata
        await connInstance.query('SELECT count(*) FROM "usa_dating_data.parquet"');
        return true;
    } catch (e) {
        console.error("Connection test failed:", e);
        throw e;
    }
};

export const runQuery = async (query: string) => {
    if (!connInstance) {
        if (!dbInstance) await initDuckDB();
        connInstance = await dbInstance!.connect();
    }
    
    // Execute query
    const result = await connInstance!.query(query);
    // Convert Arrow table to JSON
    return result.toArray().map((row) => row.toJSON());
};

export const getDbSchema = async () => {
    if (!connInstance) return [];
    const result = await connInstance.query(`DESCRIBE SELECT * FROM 'usa_dating_data.parquet'`);
    return result.toArray().map(row => row.toJSON());
};

export const getDbPreview = async () => {
    if (!connInstance) return [];
    // Limit to 5 rows to minimize data transfer on preview
    const result = await connInstance.query(`SELECT * FROM 'usa_dating_data.parquet' LIMIT 5`);
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
        FROM 'usa_dating_data.parquet' 
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
        const result = await connInstance.query(`SELECT sum(PWGTP)::DOUBLE / count(*)::DOUBLE as avg_val FROM 'usa_dating_data.parquet'`);
        const row = result.toArray()[0].toJSON();
        return Number(row.avg_val) || 0;
    } catch (e) {
        console.error("Failed to calculate average weight", e);
        return 0;
    }
};

export const isDbReady = () => !!dbInstance;