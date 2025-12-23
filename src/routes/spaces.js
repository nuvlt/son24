// src/routes/spaces.js
// Spaces API endpoints

const express = require('express');
const router = express.Router();
const { Space } = require('../models');
const { requireSpace } = require('../middleware/spaceResolver');
const ttlCleanup = require('../services/ttlCleanup');

/**
 * GET /api/space
 * Get current space info
 */
router.get('/', requireSpace, async (req, res, next) => {
    try {
        const postCount = await req.space.getActivePostCount();
        const expirationStats = await ttlCleanup.getSpaceExpirationStats(req.space.id);

        res.json({
            space: req.space.toPublic(),
            stats: {
                activePosts: postCount,
                expiring1h: parseInt(expirationStats.expiring_1h),
                expiring6h: parseInt(expirationStats.expiring_6h),
                expiring24h: parseInt(expirationStats.expiring_24h),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/space/check/:slug
 * Check if a slug is available
 */
router.get('/check/:slug', async (req, res, next) => {
    try {
        const { slug } = req.params;

        // Validate format
        if (!Space.isValidSlug(slug)) {
            return res.json({
                available: false,
                reason: 'invalid_format',
                message: 'Slug sadece küçük harf, rakam ve tire içerebilir (3-63 karakter).',
            });
        }

        // Check availability
        const isAvailable = await Space.isSlugAvailable(slug);

        res.json({
            slug,
            available: isAvailable,
            message: isAvailable 
                ? 'Bu isim kullanılabilir.' 
                : 'Bu isim zaten kullanımda.',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/space
 * Create new space (future: requires auth)
 */
router.post('/', async (req, res, next) => {
    try {
        const { slug, displayName, description, ttlHours } = req.body;

        // Validate slug
        if (!slug || !Space.isValidSlug(slug)) {
            return res.status(400).json({
                error: 'Invalid slug',
                message: 'Geçersiz alan adı. Sadece küçük harf, rakam ve tire kullanın.',
            });
        }

        // Check availability
        const isAvailable = await Space.isSlugAvailable(slug);
        if (!isAvailable) {
            return res.status(409).json({
                error: 'Slug taken',
                message: 'Bu alan adı zaten kullanımda.',
            });
        }

        // Create space
        const space = await Space.create({
            slug,
            displayName: displayName || slug,
            description,
            ttlHours: ttlHours || 24,
        });

        res.status(201).json({
            space: space.toPublic(),
            message: 'Alan oluşturuldu.',
            url: `https://${slug}.son24saat.com`,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/spaces/featured
 * Get featured/popular spaces (for landing page)
 */
router.get('/featured', async (req, res, next) => {
    try {
        const { query } = require('../config/database');
        
        const result = await query(`
            SELECT s.*, COUNT(p.id) as post_count
            FROM spaces s
            LEFT JOIN posts p ON p.space_id = s.id 
                AND p.is_visible = true 
                AND p.expires_at > NOW()
            WHERE s.is_active = true AND s.is_private = false
            GROUP BY s.id
            ORDER BY COUNT(p.id) DESC
            LIMIT 10
        `);

        const spaces = result.rows.map(row => ({
            slug: row.slug,
            displayName: row.display_name,
            description: row.description,
            activePosts: parseInt(row.post_count),
        }));

        res.json({ spaces });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
