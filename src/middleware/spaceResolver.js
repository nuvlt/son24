// src/middleware/spaceResolver.js
// Resolves subdomain to space and attaches to request

const Space = require('../models/Space');
const config = require('../config');

/**
 * Extracts subdomain from host header
 * Examples:
 *   kadikoy.son24saat.com -> kadikoy
 *   abcsirketi.son24saat.com -> abcsirketi
 *   son24saat.com -> null (main site)
 *   localhost:3000 -> uses X-Space-Slug header for dev
 */
const extractSubdomain = (host) => {
    // Remove port if present
    const hostWithoutPort = host.split(':')[0];

    if (hostWithoutPort.endsWith('.vercel.app') || hostWithoutPort.endsWith('.vercel.sh')) {
    return null;
}
    
    // Development mode: use header
    if (hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1') {
        return null; // Will check header in middleware
    }
    
    const baseDomain = config.domain.base;
    
    // Check if it's the main domain (no subdomain)
    if (hostWithoutPort === baseDomain || hostWithoutPort === `www.${baseDomain}`) {
        return null;
    }
    
    // Extract subdomain
    const regex = new RegExp(`^([a-z0-9][a-z0-9-]*[a-z0-9])\\.${baseDomain.replace('.', '\\.')}$`);
    const match = hostWithoutPort.match(regex);
    
    if (match) {
        return match[1];
    }
    
    // Check for custom domain
    return { customDomain: hostWithoutPort };
};

/**
 * Space resolver middleware
 * Attaches req.space if valid subdomain found
 * 
 * Test mode: Use ?space=slug to bypass subdomain requirement
 */
const spaceResolver = async (req, res, next) => {
    try {
        const host = req.get('host') || '';
        let subdomain = extractSubdomain(host);
        
        // Development: check X-Space-Slug header
        if (subdomain === null && req.get('X-Space-Slug')) {
            subdomain = req.get('X-Space-Slug');
        }
        
        // TEST MODE: check ?space= query parameter
        if (subdomain === null && req.query.space) {
            subdomain = req.query.space;
        }
        
        // No subdomain = main site (landing page, etc.)
        if (subdomain === null) {
            req.space = null;
            req.isMainSite = true;
            return next();
        }
        
        let space = null;
        
        // Custom domain lookup
        if (typeof subdomain === 'object' && subdomain.customDomain) {
            space = await Space.findByCustomDomain(subdomain.customDomain);
            if (!space) {
                return res.status(404).json({
                    error: 'Space not found',
                    message: 'Bu domain için kayıtlı bir alan bulunamadı.'
                });
            }
        } else {
            // Subdomain lookup
            space = await Space.findBySlug(subdomain);
            if (!space) {
                return res.status(404).json({
                    error: 'Space not found',
                    message: `"${subdomain}" adında bir alan bulunamadı.`,
                    suggestion: 'Bu alanı oluşturmak ister misiniz?'
                });
            }
        }
        
        // Check if space is active
        if (!space.isActive) {
            return res.status(410).json({
                error: 'Space inactive',
                message: 'Bu alan artık aktif değil.'
            });
        }
        
        // Attach space to request
        req.space = space;
        req.isMainSite = false;
        
        // Add space info to response headers (for debugging)
        res.set('X-Space-Id', space.id);
        res.set('X-Space-Slug', space.slug);
        res.set('X-Space-TTL', space.ttlHours.toString());
        
        next();
    } catch (error) {
        console.error('Space resolver error:', error);
        next(error);
    }
};

/**
 * Require space middleware
 * Use after spaceResolver for routes that need a space
 */
const requireSpace = (req, res, next) => {
    if (!req.space) {
        return res.status(400).json({
            error: 'Space required',
            message: 'Bu işlem için bir alan (subdomain) gereklidir.'
        });
    }
    next();
};

module.exports = {
    spaceResolver,
    requireSpace,
    extractSubdomain,
};
