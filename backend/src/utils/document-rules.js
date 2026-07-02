const ALLOWED_DOCUMENT_TYPES = {
    general: ['QT', 'RC', 'DO'],
    private: ['QT', 'IN', 'BN', 'RC', 'DO'],
    government: ['QT', 'RC', 'DO']
};

function assertDocumentTypeAllowed(customerType, documentType) {
    return (ALLOWED_DOCUMENT_TYPES[customerType] || []).includes(documentType);
}

function allowedSourceTypes(customerType, targetType) {
    if (targetType === 'BN') return ['IN'];
    if (targetType === 'IN' || targetType === 'DO') return ['QT'];

    if (targetType === 'RC') {
        if (customerType === 'government') return ['DO'];
        if (customerType === 'private') return ['QT', 'DO', 'IN', 'BN'];
        return ['QT', 'DO'];
    }

    return [];
}

module.exports = {
    ALLOWED_DOCUMENT_TYPES,
    assertDocumentTypeAllowed,
    allowedSourceTypes
};
