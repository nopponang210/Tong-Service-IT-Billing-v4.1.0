const EDITABLE_BY_ROLE = {
    admin: new Set(['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'OVERDUE']),
    staff: new Set(['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS']),
    viewer: new Set()
};

const CANCELLABLE_BY_ROLE = {
    admin: new Set(['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'REJECTED', 'OVERDUE']),
    staff: new Set(['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS']),
    viewer: new Set()
};

const DELETABLE_BY_ROLE = {
    admin: new Set(['DRAFT', 'PENDING', 'REJECTED', 'CANCELLED']),
    staff: new Set(['DRAFT', 'PENDING']),
    viewer: new Set()
};

function canEditDocument(role, status, deletedAt = null) {
    return !deletedAt && Boolean(EDITABLE_BY_ROLE[role]?.has(status));
}

function canCancelDocument(role, status, deletedAt = null) {
    return !deletedAt && Boolean(CANCELLABLE_BY_ROLE[role]?.has(status));
}

function canSoftDeleteDocument(role, status, deletedAt = null) {
    return !deletedAt && Boolean(DELETABLE_BY_ROLE[role]?.has(status));
}

module.exports = {
    canEditDocument,
    canCancelDocument,
    canSoftDeleteDocument
};
