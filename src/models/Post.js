// src/models/Post.js
// Post = Ephemeral content with TTL

const { query, transaction } = require('../config/database');
const config = require('../config');

class Post {
    constructor(data) {
        this.id = data.id;
        this.spaceId = data.space_id;
        this.deviceId = data.device_id;
        this.content = data.content;
        this.imageUrl = data.image_url;
        this.createdAt = data.created_at;
        this.expiresAt = data.expires_at;
        this.isVisible = data.is_visible;
        this.isGrayed = data.is_grayed;
        this.modAction = data.mod_action;
        this.reactionCount = data.reaction_count;
        this.replyCount = data.reply_count;
        this.flagCount = data.flag_count;
        this.sessionToken = data.session_token;
    }

    // Find by ID
    static async findById(id) {
        const result = await query(
            `SELECT * FROM posts WHERE id = $1`,
            [id]
        );
        return result.rows[0] ? new Post(result.rows[0]) : null;
    }

    // Find visible post by ID (not expired, visible)
    static async findVisibleById(id) {
        const result = await query(
            `SELECT * FROM posts 
             WHERE id = $1 AND is_visible = true AND expires_at > NOW()`,
            [id]
        );
        return result.rows[0] ? new Post(result.rows[0]) : null;
    }

    // Get posts for a space (chronological feed)
    static async getBySpace(spaceId, options = {}) {
        const {
            limit = 50,
            before = null,  // cursor: created_at of last item
            includeGrayed = true,
        } = options;

        let sql = `
            SELECT * FROM posts 
            WHERE space_id = $1 
              AND is_visible = true 
              AND expires_at > NOW()
        `;
        const params = [spaceId];

        if (!includeGrayed) {
            sql += ` AND is_grayed = false`;
        }

        if (before) {
            params.push(before);
            sql += ` AND created_at < $${params.length}`;
        }

        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await query(sql, params);
        return result.rows.map(row => new Post(row));
    }

    // Create new post
    static async create(data) {
        // Validate content
        if (!data.content || data.content.trim().length === 0) {
            throw new Error('Content cannot be empty');
        }
        if (data.content.length > config.content.maxPostLength) {
            throw new Error(`Content exceeds ${config.content.maxPostLength} characters`);
        }

        const result = await query(
            `INSERT INTO posts (space_id, device_id, content, image_url, session_token)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                data.spaceId,
                data.deviceId,
                data.content.trim(),
                data.imageUrl || null,
                data.sessionToken || null
            ]
        );

        return new Post(result.rows[0]);
    }

    // Hide post (moderator action)
    async hide(reason = 'mod_hidden') {
        await query(
            `UPDATE posts SET is_visible = false, mod_action = $1 WHERE id = $2`,
            [reason, this.id]
        );
        this.isVisible = false;
        this.modAction = reason;
    }

    // Gray out post (community flagged)
    async grayOut() {
        await query(
            `UPDATE posts SET is_grayed = true, mod_action = 'community_flagged' WHERE id = $1`,
            [this.id]
        );
        this.isGrayed = true;
        this.modAction = 'community_flagged';
    }

    // Increment reply count
    async incrementReplyCount() {
        await query(
            `UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1`,
            [this.id]
        );
        this.replyCount += 1;
    }

    // Calculate time remaining
    getTimeRemaining() {
        const now = new Date();
        const expires = new Date(this.expiresAt);
        const diffMs = expires - now;
        
        if (diffMs <= 0) return { expired: true, text: 'Süresi doldu' };
        
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return { 
                expired: false, 
                hours, 
                minutes,
                text: `${hours} saat ${minutes} dakika sonra silinecek`
            };
        }
        return { 
            expired: false, 
            hours: 0, 
            minutes,
            text: `${minutes} dakika sonra silinecek`
        };
    }

    // Get public representation
    toPublic(currentSessionToken = null) {
        const timeRemaining = this.getTimeRemaining();
        
        return {
            id: this.id,
            content: this.content,
            imageUrl: this.imageUrl,
            createdAt: this.createdAt,
            expiresAt: this.expiresAt,
            timeRemaining: timeRemaining.text,
            isGrayed: this.isGrayed,
            reactionCount: this.reactionCount,  // Hidden in UI but available
            replyCount: this.replyCount,
            isOwn: currentSessionToken && this.sessionToken === currentSessionToken,
        };
    }

    // Delete expired posts (called by cleanup service)
    static async deleteExpired() {
        const result = await query(
            `DELETE FROM posts WHERE expires_at < NOW() RETURNING id`
        );
        return result.rowCount;
    }

    // Get expiring soon (for potential notifications)
    static async getExpiringSoon(spaceId, withinMinutes = 60) {
        const result = await query(
            `SELECT * FROM posts 
             WHERE space_id = $1 
               AND expires_at > NOW() 
               AND expires_at < NOW() + INTERVAL '${withinMinutes} minutes'
               AND is_visible = true
             ORDER BY expires_at ASC`,
            [spaceId]
        );
        return result.rows.map(row => new Post(row));
    }
}

module.exports = Post;
