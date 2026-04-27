import type { CollectionConfig } from 'payload'

/**
 * User-configured price alerts.
 *
 * Distinct from the in-memory `Alert` interface in src/types/index.ts on the
 * frontend, which is read-only mock data. This collection stores the user's
 * own alert rules persisted across sessions.
 */
export const AlertConfigs: CollectionConfig = {
  slug: 'alertConfigs',
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  admin: {
    useAsTitle: 'asset',
    defaultColumns: ['asset', 'condition', 'threshold', 'status', 'userId'],
  },
  fields: [
    { name: 'userId', type: 'text', required: true, defaultValue: 'demo-user', index: true },
    { name: 'asset', type: 'text', required: true, index: true },
    {
      name: 'condition',
      type: 'select',
      required: true,
      options: [
        { label: 'Above', value: 'above' },
        { label: 'Below', value: 'below' },
      ],
    },
    { name: 'threshold', type: 'number', required: true, min: 0 },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Triggered', value: 'triggered' },
        { label: 'Expired', value: 'expired' },
      ],
    },
    {
      name: 'createdAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
  ],
}
