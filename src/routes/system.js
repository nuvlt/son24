// src/routes/system.js
// System & health check endpoints

const express = require('express');
const router = express.Router();
const { healthCheck } = require('../config/database');
const ttlCleanup = require('../services/ttlCleanup');
const autoModeration = require('../services/autoModeration');
const config = require('../config');

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
    const dbHealth = await healthCheck();
    
    const status = dbHealth.status === 'healthy' ? 200 : 503;
    
    res.status(status).json({
        status: dbHealth.status,
        timestamp: new Date().toISOString(),
        database: dbHealth,
        services: {
            ttlCleanup: ttlCleanup.getStats(),
            autoModeration: autoModeration.getStats(),
        },
        config: {
            defaultTTL: config.ttl.default,
            cleanupInterval: config.ttl.cleanupInterval,
        },
    });
});

/**
 * GET /api/reactions/options
 * Get available reaction types
 */
router.get('/reactions/options', (req, res) => {
    const { Reaction } = require('../models');
    res.json({
        options: Reaction.getOptions(),
    });
});

/**
 * GET /api/flags/options
 * Get available flag reasons
 */
router.get('/flags/options', (req, res) => {
    const { Flag } = require('../models');
    res.json({
        options: Flag.getOptions(),
    });
});

/**
 * GET /api/config
 * Get public configuration
 */
router.get('/config', (req, res) => {
    res.json({
        ttl: {
            default: config.ttl.default,
            min: config.ttl.min,
            max: config.ttl.max,
        },
        content: {
            maxPostLength: config.content.maxPostLength,
            maxReplyLength: config.content.maxReplyLength,
        },
        rateLimit: {
            maxPostsPerMinute: config.rateLimit.maxPostsPerWindow,
        },
    });
});

/**
 * GET /api/debug/spaces
 * List all spaces (for debugging)
 */
router.get('/debug/spaces', async (req, res) => {
    try {
        const { query } = require('../config/database');
        const result = await query('SELECT id, slug, display_name, ttl_hours, is_active FROM spaces');
        res.json({ 
            count: result.rows.length,
            spaces: result.rows 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
