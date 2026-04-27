import type { CollectionConfig } from 'payload'

export const Assets: CollectionConfig = {
  slug: 'assets',
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'symbol', 'riskTier', 'marketCapTier', 'isActive'],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'symbol', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'riskTier',
      type: 'select',
      required: true,
      defaultValue: 'medium',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
      ],
    },
    {
      name: 'exchanges',
      type: 'array',
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      name: 'marketCapTier',
      type: 'select',
      required: true,
      defaultValue: 'large',
      options: [
        { label: 'Large', value: 'large' },
        { label: 'Mid', value: 'mid' },
        { label: 'Small', value: 'small' },
      ],
    },
    { name: 'chain', type: 'text' },
    { name: 'isActive', type: 'checkbox', required: true, defaultValue: true },
  ],
}
