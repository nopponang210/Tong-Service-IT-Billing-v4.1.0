const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordSchema } = require('../src/validators/schemas');

test('accepts password matching all rules', () => {
    assert.equal(passwordSchema.safeParse('Admin@123').success, true);
});

test('rejects password shorter than 8 characters', () => {
    const result = passwordSchema.safeParse('Aa1!xyz');
    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join(' '), /อย่างน้อย 8/);
});

test('rejects Thai characters and spaces', () => {
    assert.equal(passwordSchema.safeParse('รหัสAa1!').success, false);
    assert.equal(passwordSchema.safeParse('Admin 1!').success, false);
});

test('requires upper, lower, number, and special character', () => {
    assert.equal(passwordSchema.safeParse('admin@123').success, false);
    assert.equal(passwordSchema.safeParse('ADMIN@123').success, false);
    assert.equal(passwordSchema.safeParse('Admin@Test').success, false);
    assert.equal(passwordSchema.safeParse('Admin123').success, false);
});
