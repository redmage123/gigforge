import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as contactsService from '../services/contacts.service';
import { importCsv, exportCsv } from '../services/csv.service';

const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export async function listContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q, tag, page, limit, sortBy, sortOrder } = req.query;
    const { contacts, pagination } = await contactsService.getContacts({
      q: q as string | undefined,
      tag: tag as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      sortBy: sortBy as 'name' | 'company' | 'created_at' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });
    res.json({ data: contacts, pagination });
  } catch (err) {
    next(err);
  }
}

export async function getContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await contactsService.getContactById(req.params.id);
    if (!contact) {
      res.status(404).json({ data: null, error: 'Contact not found' });
      return;
    }
    res.json({ data: contact });
  } catch (err) {
    next(err);
  }
}

export async function createContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createContactSchema.parse(req.body);
    const contact = await contactsService.createContact(body);
    res.status(201).json({ data: contact });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      res.status(422).json({ data: null, error: 'Validation failed', fields });
      return;
    }
    next(err);
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateContactSchema.parse(req.body);
    const contact = await contactsService.updateContact(req.params.id, body);
    if (!contact) {
      res.status(404).json({ data: null, error: 'Contact not found' });
      return;
    }
    res.json({ data: contact });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      res.status(422).json({ data: null, error: 'Validation failed', fields });
      return;
    }
    next(err);
  }
}

export async function deleteContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deleted = await contactsService.deleteContact(req.params.id);
    if (!deleted) {
      res.status(404).json({ data: null, error: 'Contact not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function importContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ data: null, error: 'No CSV file uploaded' });
      return;
    }
    const result = await importCsv(req.file.buffer);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function exportContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await exportCsv(res);
  } catch (err) {
    next(err);
  }
}
