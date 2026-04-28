import type { CollectionConfig } from 'payload'

/**
 * Per-user price-alert configurations (Sprint 7 scoping).
 *
 * `userId` is set from `req.user` on create; all read/write paths are
 * filtered to the authenticated user.
 */
export const AlertConfigs: CollectionConfig = {
  slug: 'alertConfigs',
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
    useAsTitle: 'asset',
    defaultColumns: ['asset', 'condition', 'threshold', 'status', 'userId'],
  },
  fields: [
    { name: 'userId', type: 'text', required: true, index: true },
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
