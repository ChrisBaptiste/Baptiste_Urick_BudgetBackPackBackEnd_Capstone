// Create middleware/security.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

// General rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Search API rate limiting (external API calls are expensive)
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 searches per minute
  message: {
    error: 'Too many search requests, please wait before searching again.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helmet configuration for security headers
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.kiwi.com", "https://airbnb19.p.rapidapi.com", "https://google-map-places-new-v2.p.rapidapi.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable COEP for external images
});

// Validation middleware factory
const createValidationMiddleware = (validations) => {
  return [
    ...validations,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          msg: 'Validation failed',
          errors: errors.array()
        });
      }
      next();
    }
  ];
};

// Common validation rules
const userValidation = {
  register: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
      .matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
      .withMessage('Password must contain at least one uppercase letter, one number, and one special character')
  ],
  
  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ]
};

const tripValidation = {
  create: [
    body('tripName')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Trip name must be between 1 and 100 characters'),
    
    body('destinationCity')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Destination city is required and must be less than 100 characters'),
    
    body('destinationCountry')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Destination country is required and must be less than 100 characters'),
    
    body('startDate')
      .isISO8601()
      .toDate()
      .withMessage('Start date must be a valid date'),
    
    body('endDate')
      .isISO8601()
      .toDate()
      .withMessage('End date must be a valid date')
      .custom((endDate, { req }) => {
        if (new Date(endDate) <= new Date(req.body.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
    
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes must be less than 1000 characters')
  ],
  
  update: [
    body('tripName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Trip name must be between 1 and 100 characters'),
    
    body('destinationCity')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Destination city must be less than 100 characters'),
    
    body('destinationCountry')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Destination country must be less than 100 characters'),
    
    body('startDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Start date must be a valid date'),
    
    body('endDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('End date must be a valid date'),
    
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes must be less than 1000 characters')
  ]
};

// Search validation
const searchValidation = {
  flights: [
    body('origin')
      .optional()
      .trim()
      .isLength({ min: 2, max: 10 })
      .withMessage('Origin must be a valid airport code'),
    
    body('destination')
      .optional()
      .trim()
      .isLength({ min: 2, max: 10 })
      .withMessage('Destination must be a valid airport code'),
    
    body('departureDate')
      .optional()
      .isISO8601()
      .withMessage('Departure date must be a valid date'),
    
    body('returnDate')
      .optional()
      .isISO8601()
      .withMessage('Return date must be a valid date'),
    
    body('adults')
      .optional()
      .isInt({ min: 1, max: 9 })
      .withMessage('Adults must be between 1 and 9')
  ],
  
  accommodations: [
    body('destinationCity')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Destination city is required'),
    
    body('checkInDate')
      .optional()
      .isISO8601()
      .withMessage('Check-in date must be a valid date'),
    
    body('checkOutDate')
      .optional()
      .isISO8601()
      .withMessage('Check-out date must be a valid date'),
    
    body('adults')
      .optional()
      .isInt({ min: 1, max: 16 })
      .withMessage('Adults must be between 1 and 16')
  ]
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => ({ msg: val.message }));
    return res.status(400).json({ errors });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ msg: 'Invalid ID format' });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ 
      msg: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` 
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ msg: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ msg: 'Token expired' });
  }

  // Default server error
  res.status(500).json({ 
    msg: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - IP: ${req.ip}`);
  });
  
  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  searchLimiter,
  helmetConfig,
  createValidationMiddleware,
  userValidation,
  tripValidation,
  searchValidation,
  errorHandler,
  requestLogger,
  securityHeaders
};