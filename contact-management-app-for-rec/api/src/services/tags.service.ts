import pool from '../db';
import { Tag } from '../types';

export async function getAllTags(): Promise<Tag[]> {
  const { rows } = await pool.query<Tag>(
    'SELECT id, name, colour, is_system, created_at FROM tags ORDER BY name ASC'
  );
  return rows;
}

export async function createTag(name: string, colour?: string): Promise<Tag> {
  const existing = await pool.query('SELECT id FROM tags WHERE lower(name) = lower($1)', [name]);
  if (existing.rows.length > 0) {
    const err = new Error('Tag name already exists') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const { rows } = await pool.query<Tag>(
    'INSERT INTO tags (name, colour) VALUES ($1, $2) RETURNING id, name, colour, is_system, created_at',
    [name, colour || '#6B7280']
  );
  return rows[0];
}

export async function deleteTag(id: string): Promise<void> {
  const { rows } = await pool.query('SELECT is_system FROM tags WHERE id = $1', [id]);
  if (rows.length === 0) {
    const err = new Error('Tag not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  if (rows[0].is_system) {
    const err = new Error('Cannot delete system tags') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  await pool.query('DELETE FROM tags WHERE id = $1', [id]);
}

export async function assignTagToContact(contactId: string, tagId: string): Promise<void> {
  const contact = await pool.query('SELECT id FROM contacts WHERE id = $1', [contactId]);
  if (contact.rows.length === 0) {
    const err = new Error('Contact not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  const tag = await pool.query('SELECT id FROM tags WHERE id = $1', [tagId]);
  if (tag.rows.length === 0) {
    const err = new Error('Tag not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  await pool.query(
    'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [contactId, tagId]
  );
}

export async function removeTagFromContact(contactId: string, tagId: string): Promise<void> {
  await pool.query(
    'DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2',
    [contactId, tagId]
  );
}
