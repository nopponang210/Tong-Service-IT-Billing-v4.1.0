function formatPeriod(dateValue, periodFormat) {
    const date = new Date(`${dateValue}T00:00:00Z`);
    const yearBE = date.getUTCFullYear() + 543;
    const byy = String(yearBE).slice(-2);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    if (periodFormat === 'BYY') return byy;
    if (periodFormat === 'MMBYY') return `${month}${byy}`;
    if (periodFormat === 'NONE') return 'ALL';
    return `${byy}${month}`;
}

function formatDocumentNumber({ config, sequence, periodKey }) {
    const prefix = config.prefix || '';
    const digits = Number(config.digits || 3);
    const separator = config.separator ?? '-';
    const sequencePart = String(sequence).padStart(digits, '0');
    const suffix = config.period === 'NONE' ? '' : `${separator}${periodKey}`;
    return `${prefix}${sequencePart}${suffix}`;
}

module.exports = { formatPeriod, formatDocumentNumber };
