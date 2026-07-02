const AppError = require('../utils/app-error');

module.exports = (...roles) => (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
        return next(new AppError(403, 'คุณไม่มีสิทธิ์ทำรายการนี้', 'FORBIDDEN'));
    }
    next();
};
