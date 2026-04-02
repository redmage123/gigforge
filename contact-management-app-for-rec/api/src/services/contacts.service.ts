import pool from '../db';
import { Contact, ContactsQuery, CreateContactBody, UpdateContactBody, Pagination } from '../types';

interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  tags: Array<{ id: string; name: string; colour: string; is_system: boolean }> | null;
}

function buildContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags: (row.tags || []).map(t => ({ ...t, created_at: new Date() })),
  };
}

export async function getContacts(query: ContactsQuery): Promise<{ contacts: Contact[]; pagination: Pagination }> {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 25));
  const offset = (page - 1) * limit;
  const sortBy = ['name', 'company', 'created_at'].includes(query.sortBy || '') ? query.sortBy : 'created_at';
  const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.q) {
    params.push(query.q);
    conditions.push(`to_tsvector('english', coalesce(c.name,'') || ' ' || coalesce(c.email,'') || ' ' || coalesce(c.company,'')) @@ plainto_tsquery('english', $${params.length})`);
  }

  if (query.tag) {
    params.push(query.tag);
    conditions.push(`EXISTS (
      SELECT 1 FROM contact_tags ct2
      JOIN tags t2 ON ct2.tag_id = t2.id
      WHERE ct2.contact_id = c.id AND (t2.name = $${params.length} OR t2.id::text = $${params.length})
    )`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) FROM contacts c ${where}`;
  const { rows: countRows } = await pool.query(countQuery, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limit);
  params.push(offset);

  const dataQuery = `
    SELECT
      c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at, c.updated_at,
      COALESCE(
        json_agg(
          json_build_object('id', t.id, 'name', t.name, 'colour', t.colour, 'is_system', t.is_system)
          ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'
      ) AS tags
    FROM contacts c
    LEFT JOIN contact_tags ct ON ct.contact_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    ${where}
    GROUP BY c.id
    ORDER BY c.${sortBy} ${sortOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await pool.query<ContactRow>(dataQuery, params);

  return {
    contacts: rows.map(buildContact),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function getContactById(id: string): Promise<Contact | null> {
  const { rows } = await pool.query<ContactRow>(`
    SELECT
      c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at, c.updated_at,
      COALESCE(
        json_agg(
          json_build_object('id', t.id, 'name', t.name, 'colour', t.colour, 'is_system', t.is_system)
          ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'
      ) AS tags
    FROM contacts c
    LEFT JOIN contact_tags ct ON ct.contact_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE c.id = $1
    GROUP BY c.id
  `, [id]);

  if (rows.length === 0) return null;
  return buildContact(rows[0]);
}

export async function createContact(body: CreateContactBody): Promise<Contact> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<ContactRow>(
      `INSERT INTO contacts (name, email, phone, company, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, company, notes, created_at, updated_at`,
      [body.name, body.email || null, body.phone || null, body.company || null, body.notes || null]
    );
    const contact = rows[0];

    if (body.tagIds && body.tagIds.length > 0) {
      for (const tagId of body.tagIds) {
        await client.query(
          'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [contact.id, tagId]
        );
      }
    }

    await client.query('COMMIT');

    const full = await getContactById(contact.id);
    return full!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateContact(id: string, body: UpdateContactBody): Promise<Contact | null> {
  const existing = await getContactById(id);
  if (!existing) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields: string[] = [];
    const params: (string | null)[] = [];

    if (body.name !== undefined) { params.push(body.name); fields.push(`name = $${params.length}`); }
    if (body.email !== undefined) { params.push(body.email || null); fields.push(`email = $${params.length}`); }
    if (body.phone !== undefined) { params.push(body.phone || null); fields.push(`phone = $${params.length}`); }
    if (body.company !== undefined) { params.push(body.company || null); fields.push(`company = $${params.length}`); }
    if (body.notes !== undefined) { params.push(body.notes || null); fields.push(`notes = $${params.length}`); }

    if (fields.length > 0) {
      params.push(id);
      await client.query(
        `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    if (body.tagIds !== undefined) {
      await client.query('DELETE FROM contact_tags WHERE contact_id = $1', [id]);
      for (const tagId of body.tagIds) {
        await client.query(
          'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, tagId]
        );
      }
    }

    await client.query('COMMIT');
    return getContactById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteContact(id: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
