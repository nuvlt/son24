// src/services/ttlCleanup.js
// TTL-based content cleanup service
// "Burası arşiv değil, an."

const { query } = require('../config/database');

// In-memory tracking for lazy cleanup (resets on cold start)
let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class TTLCleanupService {
    constructor() {
        this.stats = {
            totalDeleted: 0,
            runs: 0,
        };
    }

    /**
     * Lazy cleanup - runs automatically if enough time has passed
     * Call this on every request
     */
    async lazyCleanup() {
        const now = Date.now();
        
        // Skip if cleaned recently
        if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
            return { skipped: true };
        }
        
        // Update timestamp first to prevent concurrent runs
        lastCleanupTime = now;
        
        try {
            const result = await this.cleanupDirect();
            return { skipped: false, ...result };
        } catch (error) {
            console.error('Lazy cleanup error:', error);
            return { skipped: false, error: error.message };
        }
    }

    /**
     * Delete expired posts directly
     */
    async cleanupDirect() {
        const startTime = Date.now();
        
        try {
            const result = await query(
                `DELETE FROM posts WHERE expires_at < NOW() RETURNING id`
            );
            
            const duration = Date.now() - startTime;
            const deletedCount = result.rowCount;
            
            if (deletedCount > 0) {
                console.log(`🧹 Cleanup: Deleted ${deletedCount} posts in ${duration}ms`);
                this.stats.totalDeleted += deletedCount;
            }
            
            this.stats.runs++;
            
            return {
                deletedPosts: deletedCount,
                duration,
            };
        } catch (error) {
            console.error('Cleanup error:', error);
            throw error;
        }
    }

    /**
     * Force run cleanup (for manual trigger)
     */
    async run() {
        lastCleanupTime = 0; // Reset to force run
        return this.lazyCleanup();
    }

    /**
     * Get service stats
     */
    getStats() {
        return {
            ...this.stats,
            lastCleanupTime: lastCleanupTime ? new Date(lastCleanupTime).toISOString() : null,
            intervalMs: CLEANUP_INTERVAL_MS,
        };
    }

    /**
     * Preview what would be deleted
     */
    async preview() {
        const result = await query(`
            SELECT 
                s.slug as space,
                COUNT(p.id) as expired_posts
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

    // Placeholder methods for compatibility
    start() { return this; }
    stop() {}
}

// Singleton
const ttlCleanupService = new TTLCleanupService();

module.exports = ttlCleanupService;
