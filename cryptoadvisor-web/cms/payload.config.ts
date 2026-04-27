import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { Assets } from './src/collections/Assets'
import { Signals } from './src/collections/Signals'
import { Users } from './src/collections/Users'
import { searchRoute } from './src/routes/search'
import { riskCalculatorRoute } from './src/routes/riskCalculator'
import { assetLookupRoute, assetCatalogueRoute } from './src/routes/assetLookup'
import { seedDatabase } from './src/seed'

export default buildConfig({
  admin: { user: 'users' },
  editor: lexicalEditor({}),
  collections: [Users, Assets, Signals],
  globals: [],
  endpoints: [searchRoute, riskCalculatorRoute, assetLookupRoute, assetCatalogueRoute],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./cms.sqlite' },
  }),
  secret: process.env.PAYLOAD_SECRET ?? 'change-me-in-dev',
  typescript: { outputFile: 'src/payload-types.ts' },
  onInit: async (payload) => {
    await seedDatabase(payload)
  },
})
