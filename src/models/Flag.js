// src/models/Flag.js
// Flag = Community moderation reports

const { query } = require('../config/database');
const config = require('../config');

class Flag {
    constructor(data) {
        this.id = data.id;
        this.postId = data.post_id;
        this.deviceId = data.device_id;
        this.reason = data.reason;
        this.details = data.details;
        this.createdAt = data.created_at;
    }

    // Valid flag reasons
    static get REASONS() {
        return config.flagReasons;
    }

    // Reason labels (Turkish)
    static get LABELS() {
        return {
            spam: 'Spam',
            harassment: 'Taciz / Zorbalık',
            hate_speech: 'Nefret söylemi',
            threat: 'Tehdit',
            doxxing: 'Kişisel bilgi ifşası',
            nsfw: 'Uygunsuz içerik',
            other: 'Diğer',
        };
    }

    // Validate reason
    static isValidReason(reason) {
        return config.flagReasons.includes(reason);
    }

    // Find by post and device
    static async findByPostAndDevice(postId, deviceId) {
        const result = await query(
            `SELECT * FROM flags WHERE post_id = $1 AND device_id = $2`,
            [postId, deviceId]
        );
        return result.rows[0] ? new Flag(result.rows[0]) : null;
    }

    // Create flag
    static async create(postId, deviceId, reason, details = null) {
        if (!Flag.isValidReason(reason)) {
            throw new Error(`Invalid flag reason: ${reason}`);
        }

        // Check if already flagged by this device
        const existing = await Flag.findByPostAndDevice(postId, deviceId);
        if (existing) {
            throw new Error('You have already flagged this post');
        }

        const result = await query(
            `INSERT INTO flags (post_id, device_id, reason, details)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [postId, deviceId, reason, details]
        );

        return new Flag(result.rows[0]);
    }

    // Get flag count for a post
    static async getCount(postId) {
        const result = await query(
            `SELECT COUNT(*) as count FROM flags WHERE post_id = $1`,
            [postId]
        );
        return parseInt(result.rows[0].count);
    }

    // Get flag breakdown by reason
    static async getBreakdown(postId) {
        const result = await query(
            `SELECT reason, COUNT(*) as count 
             FROM flags 
             WHERE post_id = $1 
             GROUP BY reason`,
            [postId]
        );
        
        const breakdown = {};
        for (const reason of config.flagReasons) {
            breakdown[reason] = 0;
        }
        for (const row of result.rows) {
            breakdown[row.reason] = parseInt(row.count);
        }
        return breakdown;
    }

    // Check if device has flagged this post
    static async hasDeviceFlagged(postId, deviceId) {
        const result = await query(
            `SELECT 1 FROM flags WHERE post_id = $1 AND device_id = $2 LIMIT 1`,
            [postId, deviceId]
        );
        return result.rows.length > 0;
    }

    // Get all flags for a post (admin)
    static async getAllByPost(postId) {
        const result = await query(
            `SELECT * FROM flags WHERE post_id = $1 ORDER BY created_at DESC`,
            [postId]
        );
        return result.rows.map(row => new Flag(row));
    }

    // Get heavily flagged posts in a space (for moderation)
    static async getHeavilyFlagged(spaceId, minFlags = 3) {
        const result = await query(
            `SELECT p.*, COUNT(f.id) as flag_count
             FROM posts p
             JOIN flags f ON f.post_id = p.id
             WHERE p.space_id = $1 AND p.is_visible = true
             GROUP BY p.id
             HAVING COUNT(f.id) >= $2
             ORDER BY COUNT(f.id) DESC`,
            [spaceId, minFlags]
        );
        return result.rows;
    }

    // Get flag options for UI
    static getOptions() {
        return config.flagReasons.map(reason => ({
            reason,
            label: Flag.LABELS[reason] || reason,
        }));
    }

    // Public representation
    toPublic() {
        return {
            reason: this.reason,
            label: Flag.LABELS[this.reason] || this.reason,
            createdAt: this.createdAt,
        };
    }
}

module.exports = Flag;
