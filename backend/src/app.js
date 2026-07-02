const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');

const authRoutes = require('./routes/auth.routes');
const customerRoutes = require('./routes/customer.routes');
const productRoutes = require('./routes/product.routes');
const documentRoutes = require('./routes/document.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const reportRoutes = require('./routes/report.routes');
const settingsRoutes = require('./routes/settings.routes');
const userRoutes = require('./routes/user.routes');
const backupRoutes = require('./routes/backup.routes');
const healthRoutes = require('./routes/health.routes');

const {
  notFound,
  errorHandler,
} = require('./middleware/error-handler');

const app = express();

/*
 * Render ใช้ Proxy อยู่ด้านหน้า Express
 * ต้องตั้ง trust proxy เพื่อให้ Rate Limit อ่าน IP ได้ถูกต้อง
 */
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

/*
 * Security headers
 */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

/*
 * ตรวจสอบว่า Origin ได้รับอนุญาตหรือไม่
 *
 * รองรับค่าปกติ:
 * https://your-frontend.onrender.com
 *
 * และรองรับ Wildcard:
 * https://*.onrender.com
 */
function originAllowed(origin) {
  // อนุญาต Request ที่ไม่มี Origin เช่น Render health check,
  // Postman, PowerShell หรือการเรียกจาก Backend
  if (!origin) {
    return true;
  }

  return env.corsOrigins.some((allowedOrigin) => {
    if (allowedOrigin === origin) {
      return true;
    }

    if (!allowedOrigin.includes('*')) {
      return false;
    }

    try {
      const allowedUrl = new URL(
        allowedOrigin.replace('*.', 'placeholder.')
      );

      const originUrl = new URL(origin);

      const domainSuffix = allowedUrl.hostname.replace(
        /^placeholder\./,
        ''
      );

      return (
        originUrl.protocol === allowedUrl.protocol &&
        originUrl.hostname.endsWith(`.${domainSuffix}`)
      );
    } catch {
      return false;
    }
  });
}

/*
 * CORS
 */
app.use(
  cors({
    origin(origin, callback) {
      if (originAllowed(origin)) {
        return callback(null, true);
      }

      console.error(`Blocked CORS origin: ${origin}`);

      return callback(
        new Error('Origin is not allowed by CORS')
      );
    },

    credentials: true,
  })
);

/*
 * Body parser
 */
app.use(
  express.json({
    limit: '3mb',
    strict: true,
  })
);

/*
 * Rate limit
 */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 700,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  })
);

/*
 * API information
 */
app.get('/', (_req, res) => {
  res.json({
    name: 'Tong Service IT Billing API',
    version: '4.1.0',
    status: 'running',
  });
});

/*
 * API Routes
 */
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/backup', backupRoutes);

/*
 * 404 และ Error handler
 * ต้องอยู่หลัง Routes ทั้งหมด
 */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
