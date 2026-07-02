const test = require('node:test');
const assert = require('node:assert/strict');
const { getDocumentSchemaStatus, REQUIRED_DOCUMENT_COLUMNS } = require('../src/services/schema.service');

test('schema status reports missing document columns', async () => {
    const client = {
        async query() {
            return { rows: [{ column_name: REQUIRED_DOCUMENT_COLUMNS[0] }] };
        }
    };
    const result = await getDocumentSchemaStatus(client);
    assert.equal(result.ready, false);
    assert.equal(result.missing.length, REQUIRED_DOCUMENT_COLUMNS.length - 1);
});

test('schema status is ready when all columns exist', async () => {
    const client = {
        async query() {
            return { rows: REQUIRED_DOCUMENT_COLUMNS.map((column_name) => ({ column_name })) };
        }
    };
    const result = await getDocumentSchemaStatus(client);
    assert.equal(result.ready, true);
    assert.deepEqual(result.missing, []);
});
