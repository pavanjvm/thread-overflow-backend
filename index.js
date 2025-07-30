import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Database connection
import connectDB from './config/database.js';

// Route imports
import authRouter from './routes/auth.js';
import ideationRoutes from './routes/ideas.js';
import proposalsRouter from './routes/proposals.js';
import prototypesRouter from './routes/prototypes.js';
import subideaRouter from './routes/subideas.js';

// Middleware imports
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

// --- ENVIRONMENT VALIDATION ---
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'NODE_ENV'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// --- INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// --- DATABASE CONNECTION ---
connectDB();

// --- SECURITY MIDDLEWARE ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// --- RATE LIMITING ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === 'production' ? 1000 : 2000, // requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check and development
    return req.path === '/api/health' || NODE_ENV === 'development';
  }
});

app.use(globalLimiter);

// --- CORS CONFIGURATION ---
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:9002',
      'http://localhost:5173'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

app.use(cors(corsOptions));

// --- GENERAL MIDDLEWARE ---
app.use(compression());
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON format',
        data: null
      });
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- LOGGING MIDDLEWARE ---
if (NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

app.use(requestLogger);

// --- HEALTH CHECK ENDPOINT ---
app.get('/api/health', async (req, res) => {
  try {
    const healthCheck = {
      success: true,
      message: 'Server is healthy',
      data: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
        database: 'connected', // We'll enhance this to actually check DB connection
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100 + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100 + ' MB'
        }
      }
    };

    // Check database connection
    try {
      const mongoose = await import('mongoose');
      if (mongoose.default.connection.readyState === 1) {
        healthCheck.data.database = 'connected';
      } else {
        healthCheck.data.database = 'disconnected';
        healthCheck.success = false;
      }
    } catch (error) {
      healthCheck.data.database = 'error';
      healthCheck.success = false;
    }

    const statusCode = healthCheck.success ? 200 : 503;
    res.status(statusCode).json(healthCheck);
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      data: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// --- API INFO ENDPOINT ---
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Ideation Platform API',
    data: {
      version: process.env.npm_package_version || '1.0.0',
      environment: NODE_ENV,
      endpoints: {
        auth: '/api/auth',
        ideas: '/api/ideas',
        subideas: '/api/subideas',
        proposals: '/api/proposals',
        prototypes: '/api/prototypes',
        health: '/api/health'
      },
      documentation: '/api/docs' // You can add API documentation here
    }
  });
});

// --- API ROUTES ---
app.use('/api/auth', authRouter);
app.use('/api/ideas', ideationRoutes);
app.use('/api/subideas', subideaRouter); // Fixed the missing '/' in original code
app.use('/api/proposals', proposalsRouter);
app.use('/api/prototypes', prototypesRouter);

// --- ERROR HANDLING MIDDLEWARE ---
app.use(notFoundHandler);
app.use(errorHandler);

// --- GRACEFUL SHUTDOWN ---
const gracefulShutdown = async (signal) => {
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async (err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('🔌 HTTP server closed');
    
    try {
      const mongoose = await import('mongoose');
      await mongoose.default.connection.close();
      console.log('🗄️  Database connection closed');
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
      process.exit(1);
    }
  });
  
  // Force close server after 30 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// --- START SERVER ---
const server = app.listen(PORT, () => {
  console.log(`
🚀 Server started successfully!
📍 Environment: ${NODE_ENV}
🌐 Server: http://localhost:${PORT}
📊 Health Check: http://localhost:${PORT}/api/health
📚 API Info: http://localhost:${PORT}/api
🕐 Started at: ${new Date().toISOString()}
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
  console.error('🔍 Stack:', err.stack);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.error('🔍 Stack:', err.stack);
  process.exit(1);
});

// Handle SIGTERM and SIGINT (graceful shutdown)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;