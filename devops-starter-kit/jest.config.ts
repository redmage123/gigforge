import type { Config } from 'jest'
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testTimeout: 10000,
} satisfies Config
