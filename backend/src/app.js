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
const { notFound, errorHandler } = require('./middleware/error-handler');

const app = express();
if (env.nodeEnv === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

function originAllowed(origin) {
    if (!origin) return true;
    return env.corsOrigins.some((allowed) => {
        if (allowed === origin) return true;
        if (!allowed.includes('*')) return false;
        try {
            const allowedUrl = new URL(allowed.replace('*.', 'placeholder.'));
            const originUrl = new URL(origin);
            const suffix = allowedUrl.hostname.replace(/^placeholder\./, '');
            return originUrl.protocol === allowedUrl.protocol
                && originUrl.hostname.endsWith(`.${suffix}`);
        } catch {
            return false;
        }
    });
}

import cors from "cors";

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // อนุญาต request ที่ไม่มี Origin เช่น Postman หรือ health check
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("Blocked CORS origin:", origin);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '3mb', strict: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 700, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/', (_req, res) => res.json({ name: 'Tong Service IT Billing API', version: '4.0.0' }));
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
app.use(notFound);
app.use(errorHandler);

module.exports = app;
