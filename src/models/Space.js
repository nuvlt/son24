// src/models/Space.js
// Space = Subdomain-based community

const { query, transaction } = require('../config/database');

class Space {
    constructor(data) {
        this.id = data.id;
        this.slug = data.slug;
        this.displayName = data.display_name;
        this.description = data.description;
        this.ttlHours = data.ttl_hours;
        this.isActive = data.is_active;
        this.isPrivate = data.is_private;
        this.flagThreshold = data.flag_threshold;
        this.autoModEnabled = data.auto_mod_enabled;
        this.tier = data.tier;
        this.customDomain = data.custom_domain;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;
    }

    // Find by subdomain slug
    static async findBySlug(slug) {
        const result = await query(
            `SELECT * FROM spaces WHERE slug = $1 AND is_active = true`,
            [slug.toLowerCase()]
        );
        return result.rows[0] ? new Space(result.rows[0]) : null;
    }

    // Find by ID
    static async findById(id) {
        const result = await query(
            `SELECT * FROM spaces WHERE id = $1`,
            [id]
        );
        return result.rows[0] ? new Space(result.rows[0]) : null;
    }

    // Find by custom domain (future feature)
    static async findByCustomDomain(domain) {
        const result = await query(
            `SELECT * FROM spaces WHERE custom_domain = $1 AND is_active = true`,
            [domain.toLowerCase()]
        );
        return result.rows[0] ? new Space(result.rows[0]) : null;
    }

    // Create new space
    static async create(data) {
        const result = await query(
            `INSERT INTO spaces (slug, display_name, description, ttl_hours, is_private, tier)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                data.slug.toLowerCase(),
                data.displayName,
                data.description || null,
                data.ttlHours || 24,
                data.isPrivate || false,
                data.tier || 'free'
            ]
        );
        return new Space(result.rows[0]);
    }

    // Update space settings
    async update(data) {
        const result = await query(
            `UPDATE spaces SET
                display_name = COALESCE($1, display_name),
                description = COALESCE($2, description),
                ttl_hours = COALESCE($3, ttl_hours),
                flag_threshold = COALESCE($4, flag_threshold),
                auto_mod_enabled = COALESCE($5, auto_mod_enabled)
             WHERE id = $6
             RETURNING *`,
            [
                data.displayName,
                data.description,
                data.ttlHours,
                data.flagThreshold,
                data.autoModEnabled,
                this.id
            ]
        );
        return new Space(result.rows[0]);
    }

    // Deactivate space (soft delete)
    async deactivate() {
        await query(
            `UPDATE spaces SET is_active = false WHERE id = $1`,
            [this.id]
        );
        this.isActive = false;
    }

    // Get post count (active, non-expired)
    async getActivePostCount() {
        const result = await query(
            `SELECT COUNT(*) as count FROM posts 
             WHERE space_id = $1 AND is_visible = true AND expires_at > NOW()`,
            [this.id]
        );
        return parseInt(result.rows[0].count);
    }

    // Check if slug is available
    static async isSlugAvailable(slug) {
        const result = await query(
            `SELECT COUNT(*) as count FROM spaces WHERE slug = $1`,
            [slug.toLowerCase()]
        );
        return parseInt(result.rows[0].count) === 0;
    }

    // Validate slug format
    static isValidSlug(slug) {
        // Only lowercase letters, numbers, hyphens. 3-63 chars.
        const regex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
        // Reserved slugs
        const reserved = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'cdn', 'static'];
        return regex.test(slug) && !reserved.includes(slug);
    }

    // Get public data (for API responses)
    toPublic() {
        return {
            id: this.id,
            slug: this.slug,
            displayName: this.displayName,
            description: this.description,
            ttlHours: this.ttlHours,
            tier: this.tier,
        };
    }

    // Get admin data (includes private fields)
    toAdmin() {
        return {
            ...this.toPublic(),
            isActive: this.isActive,
            isPrivate: this.isPrivate,
            flagThreshold: this.flagThreshold,
            autoModEnabled: this.autoModEnabled,
            customDomain: this.customDomain,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}

module.exports = Space;
