// src/models/Device.js
// Device = Anonymous soft identity for abuse control

const { query } = require('../config/database');
const crypto = require('crypto');
const config = require('../config');

class Device {
    constructor(data) {
        this.id = data.id;
        this.fingerprintHash = data.fingerprint_hash;
        this.reputationScore = data.reputation_score;
        this.totalPosts = data.total_posts;
        this.totalFlagsReceived = data.total_flags_received;
        this.totalFlagsGiven = data.total_flags_given;
        this.isBanned = data.is_banned;
        this.banReason = data.ban_reason;
        this.banExpiresAt = data.ban_expires_at;
        this.lastPostAt = data.last_post_at;
        this.postsLastHour = data.posts_last_hour;
        this.firstSeenAt = data.first_seen_at;
        this.lastSeenAt = data.last_seen_at;
    }

    // Generate fingerprint hash from client data
    static generateFingerprintHash(fingerprintData) {
        const normalized = JSON.stringify({
            userAgent: fingerprintData.userAgent || '',
            language: fingerprintData.language || '',
            platform: fingerprintData.platform || '',
            screenResolution: fingerprintData.screenResolution || '',
            timezone: fingerprintData.timezone || '',
            // Add more signals as needed
        });
        
        return crypto
            .createHmac('sha256', config.identity.fingerprintSalt)
            .update(normalized)
            .digest('hex');
    }

    // Find or create device by fingerprint
    static async findOrCreate(fingerprintData) {
        const hash = Device.generateFingerprintHash(fingerprintData);
        
        // Try to find existing
        let result = await query(
            `SELECT * FROM devices WHERE fingerprint_hash = $1`,
            [hash]
        );
        
        if (result.rows[0]) {
            // Update last seen
            await query(
                `UPDATE devices SET last_seen_at = NOW() WHERE id = $1`,
                [result.rows[0].id]
            );
            return new Device(result.rows[0]);
        }
        
        // Create new device
        result = await query(
            `INSERT INTO devices (fingerprint_hash)
             VALUES ($1)
             RETURNING *`,
            [hash]
        );
        
        return new Device(result.rows[0]);
    }

    // Find by ID
    static async findById(id) {
        const result = await query(
            `SELECT * FROM devices WHERE id = $1`,
            [id]
        );
        return result.rows[0] ? new Device(result.rows[0]) : null;
    }

    // Check if device can post (rate limiting + ban check)
    async canPost() {
        // Check ban
        if (this.isBanned) {
            if (this.banExpiresAt && new Date(this.banExpiresAt) < new Date()) {
                // Ban expired, lift it
                await this.unban();
            } else {
                return { allowed: false, reason: 'banned', until: this.banExpiresAt };
            }
        }
        
        // Check rate limit
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (this.lastPostAt && new Date(this.lastPostAt) > oneHourAgo) {
            if (this.postsLastHour >= config.rateLimit.maxPostsPerWindow * 60) {
                return { allowed: false, reason: 'rate_limited' };
            }
        }
        
        // Check reputation (very low reputation = shadowban)
        if (this.reputationScore < 10) {
            return { allowed: false, reason: 'low_reputation' };
        }
        
        return { allowed: true };
    }

    // Record a new post
    async recordPost() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const resetCount = !this.lastPostAt || new Date(this.lastPostAt) < oneHourAgo;
        
        await query(
            `UPDATE devices SET
                last_post_at = NOW(),
                posts_last_hour = $1,
                total_posts = total_posts + 1,
                last_seen_at = NOW()
             WHERE id = $2`,
            [resetCount ? 1 : this.postsLastHour + 1, this.id]
        );
        
        this.totalPosts += 1;
        this.postsLastHour = resetCount ? 1 : this.postsLastHour + 1;
    }

    // Update reputation
    async updateReputation(delta) {
        const newScore = Math.max(0, Math.min(100, this.reputationScore + delta));
        await query(
            `UPDATE devices SET reputation_score = $1 WHERE id = $2`,
            [newScore, this.id]
        );
        this.reputationScore = newScore;
    }

    // Ban device
    async ban(reason, durationHours = null) {
        const expiresAt = durationHours 
            ? new Date(Date.now() + durationHours * 60 * 60 * 1000) 
            : null;
        
        await query(
            `UPDATE devices SET 
                is_banned = true, 
                ban_reason = $1, 
                ban_expires_at = $2
             WHERE id = $3`,
            [reason, expiresAt, this.id]
        );
        
        this.isBanned = true;
        this.banReason = reason;
        this.banExpiresAt = expiresAt;
    }

    // Unban device
    async unban() {
        await query(
            `UPDATE devices SET 
                is_banned = false, 
                ban_reason = NULL, 
                ban_expires_at = NULL
             WHERE id = $1`,
            [this.id]
        );
        
        this.isBanned = false;
        this.banReason = null;
        this.banExpiresAt = null;
    }

    // Get device stats (for admin)
    toAdmin() {
        return {
            id: this.id,
            fingerprintHash: this.fingerprintHash.substring(0, 8) + '...', // Truncate for privacy
            reputationScore: this.reputationScore,
            totalPosts: this.totalPosts,
            totalFlagsReceived: this.totalFlagsReceived,
            totalFlagsGiven: this.totalFlagsGiven,
            isBanned: this.isBanned,
            banReason: this.banReason,
            banExpiresAt: this.banExpiresAt,
            firstSeenAt: this.firstSeenAt,
            lastSeenAt: this.lastSeenAt,
        };
    }
}

module.exports = Device;
