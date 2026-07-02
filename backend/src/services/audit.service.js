async function writeAudit(client, { userId, action, entityType, entityId, details = {} }) {
    await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [userId || null, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details)]
    );
}

module.exports = { writeAudit };
