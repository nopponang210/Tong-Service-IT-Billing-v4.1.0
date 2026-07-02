const { z } = require('zod');

const booleanString = z
    .enum(['true', 'false'])
    .transform((value) => value === 'true');

const optionalInteger = (schema, fallback) => z.preprocess(
    (value) => value == null || String(value).trim() === '' ? undefined : value,
    schema.default(fallback)
);

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: optionalInteger(z.coerce.number().int().min(1).max(65535), 3000),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: booleanString.default('true'),
    DATABASE_SSL_REJECT_UNAUTHORIZED: booleanString.default('false'),
    DATABASE_POOL_MAX: optionalInteger(z.coerce.number().int().min(1).max(30), 5),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('8h'),
    CORS_ORIGINS: z.string().default('http://localhost:5500,http://127.0.0.1:5500'),
    FEATURE_REALTIME: booleanString.default('false'),
    FEATURE_AUTOMATIC_BACKUP: booleanString.default('false'),
    FEATURE_EMAIL_NOTIFICATIONS: booleanString.default('false')
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(z.prettifyError(parsed.error));
    process.exit(1);
}

module.exports = {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    databaseSsl: parsed.data.DATABASE_SSL,
    databaseSslRejectUnauthorized: parsed.data.DATABASE_SSL_REJECT_UNAUTHORIZED,
    databasePoolMax: parsed.data.DATABASE_POOL_MAX,
    jwtSecret: parsed.data.JWT_SECRET,
    jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean),
    features: {
        realtime: parsed.data.FEATURE_REALTIME,
        automaticBackup: parsed.data.FEATURE_AUTOMATIC_BACKUP,
        emailNotifications: parsed.data.FEATURE_EMAIL_NOTIFICATIONS
    }
};
