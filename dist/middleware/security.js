"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAccountLockout = exports.securityLogger = exports.sanitizeInput = exports.securityHeaders = exports.stockSearchLimiter = exports.generalApiLimiter = exports.moderateAuthLimiter = exports.strictAuthLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Enhanced rate limiting configurations
exports.strictAuthLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs for critical auth operations
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests from counting against the limit
    skipSuccessfulRequests: true,
});
exports.moderateAuthLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes  
    max: 10, // For less critical auth operations
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.generalApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs for general API
    message: {
        error: 'API rate limit exceeded, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.stockSearchLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Allow more frequent searches
    message: {
        error: 'Search rate limit exceeded, please slow down.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Security headers middleware
const securityHeaders = (req, res, next) => {
    // HSTS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self' https://api.polygon.io https://finnhub.io; " +
        "frame-ancestors 'none';");
    // X-Frame-Options
    res.setHeader('X-Frame-Options', 'DENY');
    // X-Content-Type-Options
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // X-XSS-Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions Policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
};
exports.securityHeaders = securityHeaders;
// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
    // Recursively sanitize object
    const sanitize = (obj) => {
        if (typeof obj === 'string') {
            // Basic XSS prevention
            return obj
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitize);
        }
        if (obj && typeof obj === 'object') {
            const sanitized = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    sanitized[key] = sanitize(obj[key]);
                }
            }
            return sanitized;
        }
        return obj;
    };
    if (req.body) {
        req.body = sanitize(req.body);
    }
    if (req.query) {
        req.query = sanitize(req.query);
    }
    if (req.params) {
        req.params = sanitize(req.params);
    }
    next();
};
exports.sanitizeInput = sanitizeInput;
// Request logging middleware for security monitoring
const securityLogger = (req, res, next) => {
    const start = Date.now();
    const originalSend = res.send;
    res.send = function (body) {
        const duration = Date.now() - start;
        const logData = {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            statusCode: res.statusCode,
            duration,
            contentLength: body ? body.length : 0,
            referer: req.get('Referer')
        };
        // Log suspicious patterns
        if (res.statusCode >= 400 ||
            req.url.includes('<script>') ||
            req.url.includes('javascript:') ||
            duration > 5000) {
            console.warn('SECURITY_LOG:', JSON.stringify(logData));
        }
        return originalSend.call(this, body);
    };
    next();
};
exports.securityLogger = securityLogger;
// Account lockout protection
const checkAccountLockout = async (req, res, next) => {
    // This will be implemented with the user auth state
    // For now, just pass through
    next();
};
exports.checkAccountLockout = checkAccountLockout;
