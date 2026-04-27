import type { CollectionConfig } from 'payload'

export const Watchlist: CollectionConfig = {
  slug: 'watchlist',
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  admin: {
    useAsTitle: 'symbol',
    defaultColumns: ['symbol', 'userId', 'addedAt'],
  },
  fields: [
    { name: 'userId', type: 'text', required: true, defaultValue: 'demo-user', index: true },
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
