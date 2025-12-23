// api/cron/cleanup.js
// Vercel Cron Job - TTL Cleanup (runs every 5 minutes)

const ttlCleanup = require('../../src/services/ttlCleanup');

module.exports = async (req, res) => {
    // Verify cron secret (Vercel sends this header)
    const authHeader = req.headers.authorization;
    
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('🧹 Cron: Starting TTL cleanup...');
        const result = await ttlCleanup.run();
        
        console.log(`✅ Cron: Cleanup complete - ${result.deletedPosts} posts deleted`);
        
        res.status(200).json({
            success: true,
            deleted: result.deletedPosts,
            duration: result.duration,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Cron: Cleanup failed', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
