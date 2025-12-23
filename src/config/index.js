// src/config/index.js
// Configuration management for son24saat

require('dotenv').config();

const config = {
    // Server
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Database - Vercel Postgres / Neon compatible
    database: {
        // Vercel Postgres uses POSTGRES_URL, fallback to DATABASE_URL
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        ssl: true, // Always use SSL for cloud databases
        max: parseInt(process.env.DB_POOL_MAX) || 10, // Lower for serverless
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
    },
    
    // Domain configuration
    domain: {
        base: process.env.BASE_DOMAIN || 'son24saat.com',
        protocol: process.env.NODE_ENV === 'production' ? 'https' : 'http',
    },
    
    // TTL Settings
    ttl: {
        default: 24,          // hours
        min: 1,               // hours (for testing)
        max: 72,              // hours (premium)
        cleanupInterval: 5,   // minutes between cleanup runs
    },
    
    // Rate Limiting
    rateLimit: {
        windowMs: 60 * 1000,        // 1 minute
        maxPostsPerWindow: 5,       // max posts per minute
        maxReactionsPerWindow: 30,  // max reactions per minute
    },
    
    // Moderation
    moderation: {
        defaultFlagThreshold: 5,    // flags to gray-out
        autoModEnabled: true,
        bannedWords: [],            // Load from DB or file
    },
    
    // Soft Identity
    identity: {
        sessionCookieName: 's24_session',
        sessionMaxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
        fingerprintSalt: process.env.FINGERPRINT_SALT || 'change-this-in-production',
    },
    
    // Content limits
    content: {
        maxPostLength: 1000,
        maxReplyLength: 500,
        maxImageSize: 5 * 1024 * 1024,  // 5MB
    },
    
    // Reaction types (immutable)
    reactionTypes: Object.freeze({
        AGREE: 'agree',               // 👍 Katılıyorum
        NOT_ALONE: 'not_alone',       // 🤝 Yalnız değilsin
        EXAGGERATED: 'exaggerated',   // 🤔 Abartı
        CROSSING_LINE: 'crossing_line' // 🚫 Sınırı aşıyor
    }),
    
    // Flag reasons
    flagReasons: Object.freeze([
        'spam',
        'harassment',
        'hate_speech',
        'threat',
        'doxxing',
        'nsfw',
        'other'
    ]),
    
    // Space tiers
    spaceTiers: Object.freeze({
        FREE: 'free',
        PREMIUM: 'premium',
        ENTERPRISE: 'enterprise'
    }),
};

// Validation
if (config.nodeEnv === 'production' && !config.database.connectionString) {
    throw new Error('DATABASE_URL is required in production');
}

module.exports = config;
