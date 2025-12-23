// src/models/Reaction.js
// Reaction = Limited, meaningful interactions (no like counts shown)

const { query } = require('../config/database');
const config = require('../config');

class Reaction {
    constructor(data) {
        this.id = data.id;
        this.postId = data.post_id;
        this.deviceId = data.device_id;
        this.reactionType = data.reaction_type;
        this.createdAt = data.created_at;
    }

    // Valid reaction types
    static get TYPES() {
        return config.reactionTypes;
    }

    // Emoji mapping for UI
    static get EMOJIS() {
        return {
            [config.reactionTypes.AGREE]: '👍',
            [config.reactionTypes.NOT_ALONE]: '🤝',
            [config.reactionTypes.EXAGGERATED]: '🤔',
            [config.reactionTypes.CROSSING_LINE]: '🚫',
        };
    }

    // Label mapping (Turkish)
    static get LABELS() {
        return {
            [config.reactionTypes.AGREE]: 'Katılıyorum',
            [config.reactionTypes.NOT_ALONE]: 'Yalnız değilsin',
            [config.reactionTypes.EXAGGERATED]: 'Abartı',
            [config.reactionTypes.CROSSING_LINE]: 'Sınırı aşıyor',
        };
    }

    // Validate reaction type
    static isValidType(type) {
        return Object.values(config.reactionTypes).includes(type);
    }

    // Find by post and device
    static async findByPostAndDevice(postId, deviceId) {
        const result = await query(
            `SELECT * FROM reactions WHERE post_id = $1 AND device_id = $2`,
            [postId, deviceId]
        );
        return result.rows[0] ? new Reaction(result.rows[0]) : null;
    }

    // Create or update reaction
    static async upsert(postId, deviceId, reactionType) {
        if (!Reaction.isValidType(reactionType)) {
            throw new Error(`Invalid reaction type: ${reactionType}`);
        }

        // Check if reaction exists
        const existing = await Reaction.findByPostAndDevice(postId, deviceId);

        if (existing) {
            if (existing.reactionType === reactionType) {
                // Same reaction = remove it (toggle off)
                await Reaction.delete(postId, deviceId);
                return { action: 'removed', reaction: null };
            } else {
                // Different reaction = update
                const result = await query(
                    `UPDATE reactions SET reaction_type = $1 WHERE id = $2 RETURNING *`,
                    [reactionType, existing.id]
                );
                return { action: 'updated', reaction: new Reaction(result.rows[0]) };
            }
        }

        // Create new reaction
        const result = await query(
            `INSERT INTO reactions (post_id, device_id, reaction_type)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [postId, deviceId, reactionType]
        );

        return { action: 'created', reaction: new Reaction(result.rows[0]) };
    }

    // Delete reaction
    static async delete(postId, deviceId) {
        await query(
            `DELETE FROM reactions WHERE post_id = $1 AND device_id = $2`,
            [postId, deviceId]
        );
    }

    // Get all reactions for a post (for internal scoring, not shown to users)
    static async getByPost(postId) {
        const result = await query(
            `SELECT reaction_type, COUNT(*) as count 
             FROM reactions 
             WHERE post_id = $1 
             GROUP BY reaction_type`,
            [postId]
        );
        
        // Return as object
        const counts = {};
        for (const type of Object.values(config.reactionTypes)) {
            counts[type] = 0;
        }
        for (const row of result.rows) {
            counts[row.reaction_type] = parseInt(row.count);
        }
        return counts;
    }

    // Get user's reaction for a post
    static async getUserReaction(postId, deviceId) {
        const reaction = await Reaction.findByPostAndDevice(postId, deviceId);
        return reaction ? reaction.reactionType : null;
    }

    // Check if "crossing_line" reactions exceed threshold
    static async checkCrossingLineThreshold(postId, threshold = 3) {
        const result = await query(
            `SELECT COUNT(*) as count FROM reactions 
             WHERE post_id = $1 AND reaction_type = $2`,
            [postId, config.reactionTypes.CROSSING_LINE]
        );
        return parseInt(result.rows[0].count) >= threshold;
    }

    // Get reaction options for UI
    static getOptions() {
        return Object.values(config.reactionTypes).map(type => ({
            type,
            emoji: Reaction.EMOJIS[type],
            label: Reaction.LABELS[type],
        }));
    }

    // Public representation
    toPublic() {
        return {
            type: this.reactionType,
            emoji: Reaction.EMOJIS[this.reactionType],
            label: Reaction.LABELS[this.reactionType],
        };
    }
}

module.exports = Reaction;
