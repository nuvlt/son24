// src/server.js
// Server entry point

const app = require('./app');
const config = require('./config');
const { healthCheck } = require('./config/database');
const ttlCleanup = require('./services/ttlCleanup');

const PORT = config.port;

// Startup sequence
async function start() {
    console.log('🚀 Starting son24saat server...');
    console.log(`📍 Environment: ${config.nodeEnv}`);
    
    // Check database connection
    console.log('📦 Checking database connection...');
    const dbHealth = await healthCheck();
    
    if (dbHealth.status !== 'healthy') {
        console.error('❌ Database connection failed:', dbHealth.error);
        console.error('💡 Make sure DATABASE_URL is set and PostgreSQL is running.');
        process.exit(1);
    }
    
    console.log(`✅ Database connected: ${dbHealth.database}`);
    
    // Start TTL cleanup service
    console.log('🧹 Starting TTL cleanup service...');
    ttlCleanup.start();
    
    // Start HTTP server
    app.listen(PORT, () => {
        console.log(`\n✨ son24saat server running!`);
        console.log(`📡 http://localhost:${PORT}`);
        console.log(`🌐 Domain: ${config.domain.base}`);
        console.log(`⏱️  Default TTL: ${config.ttl.default} hours`);
        console.log(`🧹 Cleanup interval: every ${config.ttl.cleanupInterval} minutes`);
        console.log(`\n💡 Use X-Space-Slug header for local subdomain testing`);
        console.log(`   Example: curl -H "X-Space-Slug: test" http://localhost:${PORT}/api/posts`);
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n⏹️  SIGTERM received, shutting down...');
    ttlCleanup.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n⏹️  SIGINT received, shutting down...');
    ttlCleanup.stop();
    process.exit(0);
});

// Start server
start().catch(err => {
    console.error('❌ Startup failed:', err);
    process.exit(1);
});
