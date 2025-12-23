// src/services/autoModeration.js
// Automatic content moderation (keyword + pattern based)

const config = require('../config');

class AutoModerationService {
    constructor() {
        // Turkish bad words / patterns (minimal list, expand as needed)
        this.bannedPatterns = [
            // Threats
            /\b(öldür|gebertir|keserim|vururum|yakalarım)\b/gi,
            // Direct threats with "seni"
            /seni\s+(öldür|gebert|kes|vur)/gi,
            // Doxxing patterns
            /\b(tc\s*:?\s*\d{11})\b/gi,  // TC Kimlik
            /\b(tel\s*:?\s*0?\d{10})\b/gi,  // Phone numbers
            // Extremely offensive (expand carefully)
        ];

        // Warning patterns (gray out, don't hide)
        this.warningPatterns = [
            // Mild offensive
        ];

        // Spam patterns
        this.spamPatterns = [
            // Repeated characters
            /(.)\1{5,}/g,  // Same char 6+ times
            // All caps (more than 50 chars)
            /^[A-ZĞÜŞİÖÇ\s]{50,}$/,
            // URL spam
            /(https?:\/\/[^\s]+\s*){3,}/gi,  // 3+ URLs
            // Phone number spam
            /(\d{10,}.*){2,}/g,  // Multiple phone numbers
        ];
    }

    /**
     * Analyze content and return moderation result
     */
    analyze(content) {
        const result = {
            action: 'allow',  // allow, warn, block
            reasons: [],
            score: 0,  // 0-100, higher = worse
        };

        const normalizedContent = this.normalize(content);

        // Check banned patterns (immediate block)
        for (const pattern of this.bannedPatterns) {
            if (pattern.test(normalizedContent)) {
                result.action = 'block';
                result.reasons.push('banned_content');
                result.score = 100;
                return result;
            }
        }

        // Check spam patterns
        for (const pattern of this.spamPatterns) {
            if (pattern.test(normalizedContent)) {
                result.action = 'block';
                result.reasons.push('spam');
                result.score = 80;
                return result;
            }
        }

        // Check warning patterns
        for (const pattern of this.warningPatterns) {
            if (pattern.test(normalizedContent)) {
                result.action = 'warn';
                result.reasons.push('potentially_offensive');
                result.score += 30;
            }
        }

        // Content length checks
        if (content.length < 3) {
            result.action = 'block';
            result.reasons.push('too_short');
            result.score = 50;
        }

        // Excessive caps check
        const capsRatio = (content.match(/[A-ZĞÜŞİÖÇ]/g) || []).length / content.length;
        if (content.length > 20 && capsRatio > 0.7) {
            result.score += 20;
            result.reasons.push('excessive_caps');
        }

        // Determine final action
        if (result.score >= 60 && result.action !== 'block') {
            result.action = 'warn';
        }

        return result;
    }

    /**
     * Normalize content for pattern matching
     */
    normalize(content) {
        return content
            .toLowerCase()
            // Turkish character normalization
            .replace(/ı/g, 'i')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ş/g, 's')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            // Remove excessive whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Check if content is allowed
     */
    isAllowed(content) {
        const result = this.analyze(content);
        return result.action === 'allow';
    }

    /**
     * Check if content should be grayed (warned)
     */
    shouldWarn(content) {
        const result = this.analyze(content);
        return result.action === 'warn';
    }

    /**
     * Get moderation result for post creation
     */
    moderatePost(content) {
        const result = this.analyze(content);
        
        return {
            allowed: result.action !== 'block',
            autoGray: result.action === 'warn',
            reasons: result.reasons,
            score: result.score,
        };
    }

    /**
     * Add custom banned pattern (for admin)
     */
    addBannedPattern(pattern) {
        if (typeof pattern === 'string') {
            pattern = new RegExp(pattern, 'gi');
        }
        this.bannedPatterns.push(pattern);
    }

    /**
     * Get service stats
     */
    getStats() {
        return {
            bannedPatterns: this.bannedPatterns.length,
            warningPatterns: this.warningPatterns.length,
            spamPatterns: this.spamPatterns.length,
        };
    }
}

// Singleton instance
const autoModerationService = new AutoModerationService();

module.exports = autoModerationService;
