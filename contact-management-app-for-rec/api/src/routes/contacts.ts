import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  exportContacts,
} from '../controllers/contacts.controller';
import { assignTag, removeTag } from '../controllers/tags.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// IMPORTANT: import and export routes MUST be registered before /:id
// to prevent Express from treating 'import'/'export' as an ID parameter
router.post('/import', authMiddleware, upload.single('file'), importContacts);
router.get('/export', authMiddleware, exportContacts);

router.get('/', authMiddleware, listContacts);
router.post('/', authMiddleware, createContact);
router.get('/:id', authMiddleware, getContact);
router.put('/:id', authMiddleware, updateContact);
router.delete('/:id', authMiddleware, deleteContact);

// Tag assignment on contacts
router.post('/:id/tags', authMiddleware, assignTag);
router.delete('/:id/tags/:tagId', authMiddleware, removeTag);

export default router;
