/**
 * Manual mock for src/config/database.ts
 * Jest picks this up automatically when jest.mock('../../config/database') is called.
 */
export const mockQuery = jest.fn()
export const mockPool = { query: mockQuery }
export const getPool = jest.fn(() => mockPool)
export const closePool = jest.fn()
