const express = require('express');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const {
    documentCreateSchema, documentUpdateSchema, documentListSchema,
    documentStatusSchema, documentReasonSchema, sourceQuerySchema, idSchema
} = require('../validators/schemas');
const {
    createDocument, updateDocument, getDocumentById, listDocuments,
    listAvailableSources, updateDocumentStatus, cancelDocument,
    softDeleteDocument, restoreDocument, getDocumentAudit
} = require('../services/document.service');

const router = express.Router();
router.use(authenticate);

router.get('/', validate(documentListSchema, 'query'), asyncHandler(async (req, res) => {
    res.json(await listDocuments(req.query, { role: req.user.role }));
}));

router.get('/sources', validate(sourceQuerySchema, 'query'), asyncHandler(async (req, res) => {
    res.json({ data: await listAvailableSources(req.query) });
}));

router.get('/:id/audit', validate(idSchema, 'params'), asyncHandler(async (req, res) => {
    res.json(await getDocumentAudit(req.params.id));
}));

router.get('/:id', validate(idSchema, 'params'), asyncHandler(async (req, res) => {
    res.json({ data: await getDocumentById(req.params.id) });
}));

router.post('/', authorize('admin', 'staff'), validate(documentCreateSchema), asyncHandler(async (req, res) => {
    const data = await createDocument({ body: req.body, userId: req.user.id });
    res.status(201).json({ data });
}));

router.put('/:id', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(documentUpdateSchema), asyncHandler(async (req, res) => {
    const data = await updateDocument({
        id: req.params.id,
        body: req.body,
        userId: req.user.id,
        role: req.user.role
    });
    res.json({ data });
}));

router.patch('/:id/status', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(documentStatusSchema), asyncHandler(async (req, res) => {
    if (req.body.status === 'CANCELLED') {
        const data = await cancelDocument({
            id: req.params.id,
            reason: 'ยกเลิกผ่านการเปลี่ยนสถานะ',
            userId: req.user.id,
            role: req.user.role
        });
        return res.json({ data });
    }
    const data = await updateDocumentStatus({ id: req.params.id, status: req.body.status, userId: req.user.id });
    return res.json({ data });
}));

router.post('/:id/cancel', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(documentReasonSchema), asyncHandler(async (req, res) => {
    const data = await cancelDocument({
        id: req.params.id,
        reason: req.body.reason,
        userId: req.user.id,
        role: req.user.role
    });
    res.json({ data });
}));

router.delete('/:id', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(documentReasonSchema), asyncHandler(async (req, res) => {
    const data = await softDeleteDocument({
        id: req.params.id,
        reason: req.body.reason,
        userId: req.user.id,
        role: req.user.role
    });
    res.json({ data });
}));

router.post('/:id/restore', authorize('admin'), validate(idSchema, 'params'), asyncHandler(async (req, res) => {
    const data = await restoreDocument({ id: req.params.id, userId: req.user.id });
    res.json({ data });
}));

module.exports = router;
