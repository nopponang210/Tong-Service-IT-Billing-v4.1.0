const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPeriod, formatDocumentNumber } = require('../src/utils/document-number');

test('formats Buddhist year/month suffix', () => {
    assert.equal(formatPeriod('2026-06-30', 'BYYMM'), '6906');
    assert.equal(formatDocumentNumber({ config: { prefix: 'RC', digits: 3, period: 'BYYMM', separator: '-' }, sequence: 7, periodKey: '6906' }), 'RC007-6906');
});
