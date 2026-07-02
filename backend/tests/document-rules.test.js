const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedSourceTypes, assertDocumentTypeAllowed } = require('../src/utils/document-rules');

test('general customer supports direct receipt or optional delivery workflow', () => {
    assert.equal(assertDocumentTypeAllowed('general', 'QT'), true);
    assert.equal(assertDocumentTypeAllowed('general', 'RC'), true);
    assert.equal(assertDocumentTypeAllowed('general', 'DO'), true);
    assert.equal(assertDocumentTypeAllowed('general', 'IN'), false);
    assert.deepEqual(allowedSourceTypes('general', 'RC'), ['QT', 'DO']);
});

test('government receipt must reference delivery document', () => {
    assert.deepEqual(allowedSourceTypes('government', 'DO'), ['QT']);
    assert.deepEqual(allowedSourceTypes('government', 'RC'), ['DO']);
});

test('private billing and receipt support business workflow', () => {
    assert.deepEqual(allowedSourceTypes('private', 'BN'), ['IN']);
    assert.deepEqual(allowedSourceTypes('private', 'RC'), ['QT', 'DO', 'IN', 'BN']);
});
