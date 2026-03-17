import type { Config } from 'jest'

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^../src/(.*)$': '<rootDir>/src/$1',
  },
} satisfies Config
