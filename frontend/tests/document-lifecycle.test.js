const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canEditDocument,
    canCancelDocument,
    canSoftDeleteDocument
} = require('../src/utils/document-lifecycle');

test('staff can edit active workflow documents', () => {
    assert.equal(canEditDocument('staff', 'PENDING'), true);
    assert.equal(canEditDocument('staff', 'APPROVED'), true);
    assert.equal(canEditDocument('staff', 'IN_PROGRESS'), true);
});

test('staff can delete pending documents but not approved documents', () => {
    assert.equal(canSoftDeleteDocument('staff', 'PENDING'), true);
    assert.equal(canSoftDeleteDocument('staff', 'APPROVED'), false);
});

test('admin can edit and cancel in-progress documents', () => {
    assert.equal(canEditDocument('admin', 'IN_PROGRESS'), true);
    assert.equal(canCancelDocument('admin', 'IN_PROGRESS'), true);
});

test('paid documents cannot be edited, cancelled or deleted', () => {
    assert.equal(canEditDocument('admin', 'PAID'), false);
    assert.equal(canCancelDocument('admin', 'PAID'), false);
    assert.equal(canSoftDeleteDocument('admin', 'PAID'), false);
});

test('soft-deleted documents cannot be modified again', () => {
    const deletedAt = new Date().toISOString();
    assert.equal(canEditDocument('admin', 'PENDING', deletedAt), false);
    assert.equal(canCancelDocument('admin', 'PENDING', deletedAt), false);
    assert.equal(canSoftDeleteDocument('admin', 'PENDING', deletedAt), false);
});
