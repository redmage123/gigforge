import { Response } from 'express';
import { parse } from 'fast-csv';
import { format } from 'fast-csv';
import pool from '../db';
import { CsvImportResult } from '../types';
import { createContact } from './contacts.service';

interface CsvRow {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  tags?: string;
}

export async function importCsv(buffer: Buffer): Promise<CsvImportResult> {
  return new Promise((resolve, reject) => {
    const result: CsvImportResult = { imported: 0, skipped: 0, errors: [] };
    const rows: Array<{ row: number; data: CsvRow }> = [];
    let rowNumber = 0;

    const stream = parse<CsvRow, CsvRow>({ headers: true, trim: true, ignoreEmpty: true })
      .transform((row: CsvRow) => row);

    stream.on('data', (row: CsvRow) => {
      rowNumber++;
      rows.push({ row: rowNumber, data: row });
    });

    stream.on('end', async () => {
      for (const { row, data } of rows) {
        if (!data.name || data.name.trim() === '') {
          result.skipped++;
          result.errors.push({ row, reason: 'Missing name' });
          continue;
        }

        try {
          // Resolve tag names to IDs
          const tagIds: string[] = [];
          if (data.tags && data.tags.trim()) {
            const tagNames = data.tags.split(',').map(t => t.trim()).filter(Boolean);
            for (const tagName of tagNames) {
              const { rows: tagRows } = await pool.query(
                'SELECT id FROM tags WHERE lower(name) = lower($1)',
                [tagName]
              );
              if (tagRows.length > 0) {
                tagIds.push(tagRows[0].id);
              } else {
                // Create tag on the fly
                const { rows: newTag } = await pool.query(
                  'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
                  [tagName]
                );
                tagIds.push(newTag[0].id);
              }
            }
          }

          await createContact({
            name: data.name.trim(),
            email: data.email?.trim() || undefined,
            phone: data.phone?.trim() || undefined,
            company: data.company?.trim() || undefined,
            tagIds,
          });
          result.imported++;
        } catch {
          result.skipped++;
          result.errors.push({ row, reason: 'Failed to import row' });
        }
      }
      resolve(result);
    });

    stream.on('error', reject);

    // Write buffer to stream
    const { Readable } = require('stream');
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

export async function exportCsv(res: Response): Promise<void> {
  const { rows } = await pool.query(`
    SELECT
      c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at,
      COALESCE(
        string_agg(t.name, ',' ORDER BY t.name),
        ''
      ) AS tags
    FROM contacts c
    LEFT JOIN contact_tags ct ON ct.contact_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    GROUP BY c.id
    ORDER BY c.name ASC
  `);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');

  const csvStream = format({ headers: ['name', 'email', 'phone', 'company', 'notes', 'tags', 'created_at'] });
  csvStream.pipe(res);

  for (const row of rows) {
    csvStream.write({
      name: row.name,
      email: row.email || '',
      phone: row.phone || '',
      company: row.company || '',
      notes: row.notes || '',
      tags: row.tags,
      created_at: row.created_at,
    });
  }

  csvStream.end();
}
