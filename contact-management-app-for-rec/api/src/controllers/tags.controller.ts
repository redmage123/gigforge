import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as tagsService from '../services/tags.service';

const createTagSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid colour format').optional(),
});

const assignTagSchema = z.object({
  tagId: z.string().uuid('Invalid tag ID'),
});

export async function listTags(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tags = await tagsService.getAllTags();
    res.json({ data: tags });
  } catch (err) {
    next(err);
  }
}

export async function createTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, colour } = createTagSchema.parse(req.body);
    const tag = await tagsService.createTag(name, colour);
    res.status(201).json({ data: tag });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      res.status(422).json({ data: null, error: 'Validation failed', fields });
      return;
    }
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 409) {
      res.status(409).json({ data: null, error: (err as Error).message });
      return;
    }
    next(err);
  }
}

export async function deleteTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await tagsService.deleteTag(req.params.id);
    res.status(204).send();
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 403) {
      res.status(403).json({ data: null, error: (err as Error).message });
      return;
    }
    if (statusCode === 404) {
      res.status(404).json({ data: null, error: (err as Error).message });
      return;
    }
    next(err);
  }
}

export async function assignTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tagId } = assignTagSchema.parse(req.body);
    await tagsService.assignTagToContact(req.params.id, tagId);
    res.status(201).json({ data: { message: 'Tag assigned' } });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404) {
      res.status(404).json({ data: null, error: (err as Error).message });
      return;
    }
    next(err);
  }
}

export async function removeTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await tagsService.removeTagFromContact(req.params.id, req.params.tagId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
