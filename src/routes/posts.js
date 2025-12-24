// src/routes/posts.js
// Posts API endpoints

const express = require('express');
const router = express.Router();
const { Post, Reaction, Flag, Reply } = require('../models');
const { requireSpace } = require('../middleware/spaceResolver');
const { requireDevice, canPost } = require('../middleware/deviceIdentifier');
const autoModeration = require('../services/autoModeration');

/**
 * GET /api/posts
 * Get posts for current space (chronological feed)
 */
router.get('/', requireSpace, async (req, res, next) => {
    try {
        const { before, limit = 50, includeGrayed = 'true' } = req.query;
        
        const posts = await Post.getBySpace(req.space.id, {
            limit: Math.min(parseInt(limit), 100),
            before: before || null,
            includeGrayed: includeGrayed === 'true',
        });

        // Get user's reactions for these posts
        const postIds = posts.map(p => p.id);
        let userReactions = {};
        
        if (req.device && postIds.length > 0) {
            const { query } = require('../config/database');
            const result = await query(
                `SELECT post_id, reaction_type FROM reactions 
                 WHERE device_id = $1 AND post_id = ANY($2)`,
                [req.device.id, postIds]
            );
            for (const row of result.rows) {
                userReactions[row.post_id] = row.reaction_type;
            }
        }

        const publicPosts = posts.map(post => ({
            ...post.toPublic(req.sessionToken),
            userReaction: userReactions[post.id] || null,
        }));

        res.json({
            posts: publicPosts,
            space: req.space.toPublic(),
            hasMore: posts.length === parseInt(limit),
            cursor: posts.length > 0 ? posts[posts.length - 1].createdAt : null,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/posts/:id
 * Get single post with replies
 */
router.get('/:id', requireSpace, async (req, res, next) => {
    try {
        const post = await Post.findVisibleById(req.params.id);
        
        if (!post) {
            return res.status(404).json({
                error: 'Post not found',
                message: 'Bu içerik bulunamadı veya süresi dolmuş.',
            });
        }

        if (post.spaceId !== req.space.id) {
            return res.status(404).json({
                error: 'Post not found',
                message: 'Bu içerik bu alanda bulunamadı.',
            });
        }

        const replies = await Reply.getByPost(post.id);
        
        let userReaction = null;
        if (req.device) {
            userReaction = await Reaction.getUserReaction(post.id, req.device.id);
        }

        res.json({
            post: {
                ...post.toPublic(req.sessionToken),
                userReaction,
            },
            replies: replies.map(r => r.toPublic(req.sessionToken)),
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/posts
 * Create new post
 */
router.post('/', requireSpace, requireDevice, canPost, async (req, res, next) => {
    try {
        const { content, imageUrl } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                error: 'Content required',
                message: 'İçerik boş olamaz.',
            });
        }

        const modResult = autoModeration.moderatePost(content);
        
        if (!modResult.allowed) {
            return res.status(400).json({
                error: 'Content not allowed',
                message: 'Bu içerik platformun kurallarını ihlal ediyor.',
                reasons: modResult.reasons,
            });
        }

        const post = await Post.create({
            spaceId: req.space.id,
            deviceId: req.device.id,
            content: content.trim(),
            imageUrl: imageUrl || null,
            sessionToken: req.sessionToken,
        });

        if (modResult.autoGray) {
            await post.grayOut();
        }

        await req.device.recordPost();

        res.status(201).json({
            post: post.toPublic(req.sessionToken),
            message: 'İçerik paylaşıldı.',
        });
    } catch (error) {
        console.error('Post creation error:', error);
        res.status(500).json({
            error: 'Post creation failed',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * POST /api/posts/:id/reactions
 * Add/update/remove reaction
 */
router.post('/:id/reactions', requireSpace, requireDevice, async (req, res, next) => {
    try {
        const { type } = req.body;

        if (!type || !Reaction.isValidType(type)) {
            return res.status(400).json({
                error: 'Invalid reaction type',
                message: 'Geçersiz tepki türü.',
                validTypes: Reaction.getOptions(),
            });
        }

        const post = await Post.findVisibleById(req.params.id);
        if (!post || post.spaceId !== req.space.id) {
            return res.status(404).json({
                error: 'Post not found',
                message: 'İçerik bulunamadı.',
            });
        }

        const result = await Reaction.upsert(post.id, req.device.id, type);

        res.json({
            action: result.action,
            reaction: result.reaction?.toPublic() || null,
            message: result.action === 'created' ? 'Tepki eklendi.'
                   : result.action === 'updated' ? 'Tepki güncellendi.'
                   : 'Tepki kaldırıldı.',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/posts/:id/flags
 * Flag a post
 */
router.post('/:id/flags', requireSpace, requireDevice, async (req, res, next) => {
    try {
        const { reason, details } = req.body;

        if (!reason || !Flag.isValidReason(reason)) {
            return res.status(400).json({
                error: 'Invalid flag reason',
                message: 'Geçersiz bildirim nedeni.',
                validReasons: Flag.getOptions(),
            });
        }

        const post = await Post.findVisibleById(req.params.id);
        if (!post || post.spaceId !== req.space.id) {
            return res.status(404).json({
                error: 'Post not found',
                message: 'İçerik bulunamadı.',
            });
        }

        const alreadyFlagged = await Flag.hasDeviceFlagged(post.id, req.device.id);
        if (alreadyFlagged) {
            return res.status(409).json({
                error: 'Already flagged',
                message: 'Bu içeriği zaten bildirdiniz.',
            });
        }

        await Flag.create(post.id, req.device.id, reason, details);

        res.status(201).json({
            message: 'İçerik bildirildi. Teşekkürler.',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/posts/:id/replies
 * Add reply to post
 */
router.post('/:id/replies', requireSpace, requireDevice, canPost, async (req, res, next) => {
    try {
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                error: 'Content required',
                message: 'Yanıt boş olamaz.',
            });
        }

        const post = await Post.findVisibleById(req.params.id);
        if (!post || post.spaceId !== req.space.id) {
            return res.status(404).json({
                error: 'Post not found',
                message: 'İçerik bulunamadı.',
            });
        }

        const modResult = autoModeration.moderatePost(content);
        if (!modResult.allowed) {
            return res.status(400).json({
                error: 'Content not allowed',
                message: 'Bu yanıt platformun kurallarını ihlal ediyor.',
            });
        }

        const reply = await Reply.create({
            postId: post.id,
            deviceId: req.device.id,
            content: content.trim(),
            sessionToken: req.sessionToken,
        });

        await req.device.recordPost();

        res.status(201).json({
            reply: reply.toPublic(req.sessionToken),
            message: 'Yanıt eklendi.',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/posts/:id/replies
 * Get replies for a post
 */
router.get('/:id/replies', requireSpace, async (req, res, next) => {
    try {
        const post = await Post.findVisibleById(req.params.id);
        if (!post || post.spaceId !== req.space.id) {
            return res.status(404).json({
                error: 'Post not found',
                message: 'İçerik bulunamadı.',
            });
        }

        const replies = await Reply.getByPost(post.id);

        res.json({
            replies: replies.map(r => r.toPublic(req.sessionToken)),
            count: replies.length,
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
