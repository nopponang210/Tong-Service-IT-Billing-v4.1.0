const AppError = require('../utils/app-error');

module.exports = function validate(schema, source = 'body') {
    return (req, _res, next) => {
        const parsed = schema.safeParse(req[source]);
        if (!parsed.success) {
            return next(new AppError(
                400,
                'ข้อมูลไม่ถูกต้อง',
                'VALIDATION_ERROR',
                parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
            ));
        }
        req[source] = parsed.data;
        next();
    };
};
