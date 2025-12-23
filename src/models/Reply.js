// src/models/Reply.js
// Reply = Threaded responses to posts (inherit parent TTL)

const { query } = require('../config/database');
const config = require('../config');

class Reply {
    constructor(data) {
        this.id = data.id;
        this.postId = data.post_id;
        this.deviceId = data.device_id;
        this.content = data.content;
        this.createdAt = data.created_at;
        this.isVisible = data.is_visible;
        this.flagCount = data.flag_count;
        this.sessionToken = data.session_token;
    }

    // Find by ID
    static async findById(id) {
        const result = await query(
            `SELECT * FROM replies WHERE id = $1`,
            [id]
        );
        return result.rows[0] ? new Reply(result.rows[0]) : null;
    }

    // Get replies for a post
    static async getByPost(postId, options = {}) {
        const { limit = 50, includeHidden = false } = options;

        let sql = `SELECT * FROM replies WHERE post_id = $1`;
        if (!includeHidden) {
            sql += ` AND is_visible = true`;
        }
        sql += ` ORDER BY created_at ASC LIMIT $2`;

        const result = await query(sql, [postId, limit]);
        return result.rows.map(row => new Reply(row));
    }

    // Create reply
    static async create(data) {
        // Validate content
        if (!data.content || data.content.trim().length === 0) {
            throw new Error('Reply cannot be empty');
        }
        if (data.content.length > config.content.maxReplyLength) {
            throw new Error(`Reply exceeds ${config.content.maxReplyLength} characters`);
        }

        const result = await query(
            `INSERT INTO replies (post_id, device_id, content, session_token)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
                data.postId,
                data.deviceId,
                data.content.trim(),
                data.sessionToken || null
            ]
        );

        // Update parent post reply count
        await query(
            `UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1`,
            [data.postId]
        );

        return new Reply(result.rows[0]);
    }

    // Hide reply
    async hide() {
        await query(
            `UPDATE replies SET is_visible = false WHERE id = $1`,
            [this.id]
        );
        this.isVisible = false;
    }

    // Get reply count for a post
    static async getCount(postId) {
        const result = await query(
            `SELECT COUNT(*) as count FROM replies 
             WHERE post_id = $1 AND is_visible = true`,
            [postId]
        );
        return parseInt(result.rows[0].count);
    }

    // Public representation
    toPublic(currentSessionToken = null) {
        return {
            id: this.id,
            postId: this.postId,
            content: this.content,
            createdAt: this.createdAt,
            isOwn: currentSessionToken && this.sessionToken === currentSessionToken,
        };
    }
}

module.exports = Reply;
