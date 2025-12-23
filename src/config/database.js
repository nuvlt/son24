// src/config/database.js
// PostgreSQL connection pool (Neon/Vercel Postgres compatible)

const { Pool } = require('pg');
const config = require('./index');

// Neon requires SSL
const pool = new Pool({
    connectionString: config.database.connectionString,
    ssl: {
        rejectUnauthorized: false, // Required for Neon
    },
    max: config.database.max,
    idleTimeoutMillis: config.database.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.connectionTimeoutMillis,
});

// Connection event handlers
pool.on('connect', () => {
    if (config.nodeEnv === 'development') {
        console.log('📦 New client connected to database');
    }
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

// Query helper with logging
const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        
        if (config.nodeEnv === 'development') {
            console.log('📊 Query:', { text: text.substring(0, 50), duration: `${duration}ms`, rows: result.rowCount });
        }
        
        return result;
    } catch (error) {
        console.error('❌ Query error:', { text: text.substring(0, 100), error: error.message });
        throw error;
    }
};

// Transaction helper
const transaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Health check
const healthCheck = async () => {
    try {
        const result = await query('SELECT NOW() as time, current_database() as db');
        return { 
            status: 'healthy', 
            database: result.rows[0].db,
            time: result.rows[0].time 
        };
    } catch (error) {
        return { 
            status: 'unhealthy', 
            error: error.message 
        };
    }
};

module.exports = {
    pool,
    query,
    transaction,
    healthCheck,
};
