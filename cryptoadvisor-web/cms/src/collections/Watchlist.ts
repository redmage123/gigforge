import type { CollectionConfig } from 'payload'

/**
 * Per-user watchlist (Sprint 7).
 *
 * - `userId` is auto-set from `req.user` on create.
 * - Read/update/delete restricted to the owning user (or no records when
 *   unauthenticated, since the where filter returns nothing).
 */
export const Watchlist: CollectionConfig = {
  slug: 'watchlist',
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => {
      if (!req.user) return false
      return { userId: { equals: req.user.id } }
    },
    update: ({ req }) => {
      if (!req.user) return false
      return { userId: { equals: req.user.id } }
    },
    delete: ({ req }) => {
      if (!req.user) return false
      return { userId: { equals: req.user.id } }
    },
  },
  hooks: {
    beforeChange: [
      ({ req, operation, data }) => {
        if (operation === 'create' && req.user) {
          return { ...data, userId: req.user.id }
        }
        return data
      },
    ],
  },
  admin: {
    useAsTitle: 'symbol',
    defaultColumns: ['symbol', 'userId', 'addedAt'],
  },
  fields: [
    { name: 'userId', type: 'text', required: true, index: true },
    { name: 'symbol', type: 'text', required: true, index: true },
    { name: 'name', type: 'text' },
    {
      name: 'addedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
  ],
  indexes: [{ fields: ['userId', 'symbol'], unique: true }],
}
