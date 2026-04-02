import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { listTags, createTag, deleteTag } from '../controllers/tags.controller';

const router = Router();

router.get('/', authMiddleware, listTags);
router.post('/', authMiddleware, createTag);
router.delete('/:id', authMiddleware, deleteTag);

export default router;
