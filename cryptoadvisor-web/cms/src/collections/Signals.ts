import type { CollectionConfig } from 'payload'

export const Signals: CollectionConfig = {
  slug: 'signals',
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: 'reason',
    defaultColumns: ['assetSymbol', 'direction', 'confidence', 'generatedAt'],
  },
  fields: [
    { name: 'assetSymbol', type: 'text', required: true, index: true },
    { name: 'assetName', type: 'text', required: true },
    {
      name: 'direction',
      type: 'select',
      required: true,
      options: [
        { label: 'Buy', value: 'BUY' },
        { label: 'Sell', value: 'SELL' },
        { label: 'Hold', value: 'HOLD' },
      ],
    },
    {
      name: 'confidence',
      type: 'number',
      required: true,
      min: 0,
      max: 100,
    },
    { name: 'reason', type: 'textarea', required: true },
    {
      name: 'generatedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
    { name: 'expiresAt', type: 'date' },
  ],
}
