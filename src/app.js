// src/app.js
// Express application setup

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const routes = require('./routes');
const { spaceResolver } = require('./middleware/spaceResolver');
const { deviceIdentifier } = require('./middleware/deviceIdentifier');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS - allow all subdomains
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // Allow all subdomains of son24saat.com
        const allowedPattern = /^https?:\/\/([a-z0-9-]+\.)?son24saat\.com$/;
        if (allowedPattern.test(origin) || config.nodeEnv === 'development') {
            return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: 100, // General rate limit
    message: {
        error: 'Too many requests',
        message: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
    },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Space resolution (subdomain routing)
app.use(spaceResolver);

// Device identification (soft identity)
app.use(deviceIdentifier);

// Lazy TTL cleanup (runs every 5 min on any request)
const ttlCleanup = require('./services/ttlCleanup');
app.use(async (req, res, next) => {
    // Fire and forget - don't block the request
    ttlCleanup.lazyCleanup().catch(() => {});
    next();
});

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
    if (req.isMainSite) {
        // Main site landing page
        res.json({
            name: 'son24saat.com',
            tagline: 'Burası arşiv değil, an.',
            description: 'Geçici sosyal duvar platformu',
            version: '1.0.0',
            docs: '/api/health',
        });
    } else {
        // Space landing - redirect to feed
        res.json({
            space: req.space?.toPublic(),
            message: `${req.space?.displayName} alanına hoş geldiniz.`,
            feed: '/api/posts',
        });
    }
});

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
