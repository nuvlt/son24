// src/middleware/deviceIdentifier.js
// Identifies device via fingerprint for soft identity

const Device = require('../models/Device');
const config = require('../config');
const crypto = require('crypto');

/**
 * Generate session token for "your posts" indicator
 */
const generateSessionToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Device identifier middleware
 * Extracts fingerprint from headers/cookies and attaches device to request
 */
const deviceIdentifier = async (req, res, next) => {
    try {
        // Get fingerprint data from headers or body
        const fingerprintData = {
            userAgent: req.get('User-Agent') || '',
            language: req.get('Accept-Language')?.split(',')[0] || '',
            platform: req.get('Sec-CH-UA-Platform')?.replace(/"/g, '') || '',
            // Client-side fingerprint (sent in header for API calls)
            clientFingerprint: req.get('X-Device-Fingerprint') || '',
            // IP as fallback (note: not reliable for identification, just for rate limiting)
            ip: req.ip || req.connection?.remoteAddress || '',
        };
        
        // Also check body for fingerprint (for POST requests)
        if (req.body?.fingerprint) {
            fingerprintData.clientFingerprint = req.body.fingerprint;
        }
        
        // Get or create device
        const device = await Device.findOrCreate(fingerprintData);
        
        // Check if device is banned
        if (device.isBanned) {
            if (device.banExpiresAt && new Date(device.banExpiresAt) > new Date()) {
                return res.status(403).json({
                    error: 'Device banned',
                    message: 'Bu cihaz geçici olarak engellenmiştir.',
                    until: device.banExpiresAt,
                });
            }
            // Ban expired, unban
            await device.unban();
        }
        
        // Attach device to request
        req.device = device;
        
        // Session token management
        let sessionToken = req.cookies?.[config.identity.sessionCookieName];
        if (!sessionToken) {
            sessionToken = generateSessionToken();
            res.cookie(config.identity.sessionCookieName, sessionToken, {
                maxAge: config.identity.sessionMaxAge,
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                sameSite: 'lax',
            });
        }
        req.sessionToken = sessionToken;
        
        next();
    } catch (error) {
        console.error('Device identifier error:', error);
        // Don't block the request, just continue without device
        req.device = null;
        req.sessionToken = null;
        next();
    }
};

/**
 * Require device middleware
 * Use for routes that need device identification
 */
const requireDevice = (req, res, next) => {
    if (!req.device) {
        return res.status(400).json({
            error: 'Device identification required',
            message: 'Cihaz tanımlanamadı. Lütfen sayfayı yenileyin.',
        });
    }
    next();
};

/**
 * Check posting ability middleware
 */
const canPost = async (req, res, next) => {
    if (!req.device) {
        return res.status(400).json({
            error: 'Device identification required',
            message: 'İçerik paylaşmak için cihaz tanımlaması gereklidir.',
        });
    }
    
    const check = await req.device.canPost();
    if (!check.allowed) {
        return res.status(429).json({
            error: 'Cannot post',
            reason: check.reason,
            message: check.reason === 'rate_limited' 
                ? 'Çok hızlı paylaşım yapıyorsunuz. Lütfen biraz bekleyin.'
                : check.reason === 'banned'
                    ? 'Bu cihaz engellenmiştir.'
                    : 'İçerik paylaşma izniniz yok.',
            until: check.until,
        });
    }
    
    next();
};

module.exports = {
    deviceIdentifier,
    requireDevice,
    canPost,
    generateSessionToken,
};
