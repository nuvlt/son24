// src/middleware/errorHandler.js
// Centralized error handling

const config = require('../config');

/**
 * Not found handler
 */
const notFound = (req, res, next) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'İstenen kaynak bulunamadı.',
        path: req.path,
    });
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: config.nodeEnv === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
    });

    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
        });
    }

    // Database errors
    if (err.code) {
        // PostgreSQL error codes
        switch (err.code) {
            case '23505': // unique_violation
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'Bu kayıt zaten mevcut.',
                });
            case '23503': // foreign_key_violation
                return res.status(400).json({
                    error: 'Invalid Reference',
                    message: 'Referans verilen kayıt bulunamadı.',
                });
            case '22P02': // invalid_text_representation
                return res.status(400).json({
                    error: 'Invalid Input',
                    message: 'Geçersiz veri formatı.',
                });
        }
    }

    // Default error
    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: config.nodeEnv === 'development' 
            ? err.message 
            : 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
    });
};

module.exports = {
    notFound,
    errorHandler,
};
