// src/server.js
// Server entry point (for local development only)
// On Vercel, api/index.js is used instead

const app = require('./app');
const config = require('./config');
const { healthCheck } = require('./config/database');

const PORT = config.port;

async function start() {
    console.log('🚀 Starting son24saat server...');
    console.log(`📍 Environment: ${config.nodeEnv}`);
    
    const dbHealth = await healthCheck();
    
    if (dbHealth.status !== 'healthy') {
        console.error('❌ Database connection failed:', dbHealth.error);
        process.exit(1);
    }
    
    console.log(`✅ Database connected: ${dbHealth.database}`);
    
    app.listen(PORT, () => {
        console.log(`\n✨ son24saat server running!`);
        console.log(`📡 http://localhost:${PORT}`);
        console.log(`⏱️  Default TTL: ${config.ttl.default} hours`);
        console.log(`🧹 Lazy cleanup: every 5 min on request`);
        console.log(`\n💡 Use X-Space-Slug header for subdomain testing`);
    });
}

if (require.main === module) {
    start().catch(err => {
        console.error('❌ Startup failed:', err);
        process.exit(1);
    });
}
