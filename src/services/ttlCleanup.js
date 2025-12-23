// src/services/ttlCleanup.js
// TTL-based content cleanup service
// "Burası arşiv değil, an."

const cron = require('node-cron');
const { query } = require('../config/database');
const config = require('../config');

class TTLCleanupService {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.stats = {
            totalDeleted: 0,
            runs: 0,
            errors: 0,
        };
    }

    /**
     * Delete all expired posts (and cascade to reactions, flags, replies)
     */
    async cleanupExpiredPosts() {
        const startTime = Date.now();
        
        try {
            // Use the database function for atomic cleanup
            const result = await query(`SELECT * FROM cleanup_expired_content()`);
            const { deleted_posts, deleted_replies } = result.rows[0];
            
            const duration = Date.now() - startTime;
            
            if (deleted_posts > 0) {
                console.log(`🧹 TTL Cleanup: Deleted ${deleted_posts} expired posts in ${duration}ms`);
            }
            
            return {
                deletedPosts: deleted_posts,
                deletedReplies: deleted_replies,
                duration,
            };
        } catch (error) {
            console.error('❌ TTL Cleanup error:', error);
            throw error;
        }
    }

    /**
     * Alternative cleanup using direct SQL (if function not available)
     */
    async cleanupDirect() {
        const startTime = Date.now();
        
        try {
            // Delete expired posts (cascades to reactions, flags, replies via FK)
            const result = await query(
                `DELETE FROM posts WHERE expires_at < NOW() RETURNING id`
            );
            
            const duration = Date.now() - startTime;
            const deletedCount = result.rowCount;
            
            if (deletedCount > 0) {
                console.log(`🧹 TTL Cleanup (direct): Deleted ${deletedCount} posts in ${duration}ms`);
            }
            
            return {
                deletedPosts: deletedCount,
                duration,
            };
        } catch (error) {
            console.error('❌ TTL Cleanup error:', error);
            throw error;
        }
    }

    /**
     * Run cleanup with stats tracking
     */
    async run() {
        if (this.isRunning) {
            console.log('⏳ TTL Cleanup already running, skipping...');
            return;
        }

        this.isRunning = true;
        this.stats.runs++;

        try {
            const result = await this.cleanupExpiredPosts();
            this.stats.totalDeleted += result.deletedPosts;
            this.lastRun = new Date();
            
            return result;
        } catch (error) {
            this.stats.errors++;
            // Try direct method as fallback
            try {
                return await this.cleanupDirect();
            } catch (fallbackError) {
                console.error('❌ TTL Cleanup fallback also failed:', fallbackError);
                throw fallbackError;
            }
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Start the cron job
     */
    start() {
        // Run every X minutes (configurable)
        const interval = config.ttl.cleanupInterval;
        const cronExpression = `*/${interval} * * * *`; // Every X minutes
        
        console.log(`⏰ TTL Cleanup scheduled: every ${interval} minutes`);
        
        // Schedule the job
        this.cronJob = cron.schedule(cronExpression, async () => {
            try {
                await this.run();
            } catch (error) {
                console.error('❌ Scheduled TTL Cleanup failed:', error);
            }
        });

        // Also run immediately on start
        this.run().catch(err => {
            console.error('❌ Initial TTL Cleanup failed:', err);
        });

        return this;
    }

    /**
     * Stop the cron job
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log('⏹️ TTL Cleanup stopped');
        }
    }

    /**
     * Get service stats
     */
    getStats() {
        return {
            ...this.stats,
            lastRun: this.lastRun,
            isRunning: this.isRunning,
            intervalMinutes: config.ttl.cleanupInterval,
        };
    }

    /**
     * Preview what would be deleted (for testing)
     */
    async preview() {
        const result = await query(`
            SELECT 
                s.slug as space,
                COUNT(p.id) as expired_posts,
                MIN(p.expires_at) as oldest_expired,
                MAX(p.expires_at) as newest_expired
            FROM posts p
            JOIN spaces s ON s.id = p.space_id
            WHERE p.expires_at < NOW()
            GROUP BY s.slug
            ORDER BY COUNT(p.id) DESC
        `);

        const total = await query(
            `SELECT COUNT(*) as count FROM posts WHERE expires_at < NOW()`
        );

        return {
            bySpace: result.rows,
            totalExpired: parseInt(total.rows[0].count),
        };
    }

    /**
     * Get expiration stats for a space
     */
    async getSpaceExpirationStats(spaceId) {
        const result = await query(`
            SELECT
                COUNT(*) FILTER (WHERE expires_at < NOW()) as expired,
                COUNT(*) FILTER (WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour') as expiring_1h,
                COUNT(*) FILTER (WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '6 hours') as expiring_6h,
                COUNT(*) FILTER (WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours') as expiring_24h,
                COUNT(*) as total
            FROM posts
            WHERE space_id = $1 AND is_visible = true
        `, [spaceId]);

        return result.rows[0];
    }
}

// Singleton instance
const ttlCleanupService = new TTLCleanupService();

module.exports = ttlCleanupService;
