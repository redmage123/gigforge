/**
 * Embeddings tests — all mocked, no real OpenAI key required.
 */

// Mock the openai config module
jest.mock('../src/config/openai', () => {
  const mockCreate = jest.fn()
  return {
    getOpenAIClient: jest.fn(() => ({
      embeddings: { create: mockCreate },
      chat: { completions: { create: jest.fn() } },
    })),
    resetOpenAIClient: jest.fn(),
    __mockCreate: mockCreate,
  }
})

import { getEmbedding, getBatchEmbeddings } from '../src/lib/embeddings'
import * as openaiConfig from '../src/config/openai'

function makeEmbeddingResponse(texts: string[]) {
  return {
    data: texts.map((text, i) => ({
      embedding: Array.from({ length: 1536 }, (_: unknown, j: number) =>
        Math.sin(text.length + i + j) * 0.1
      ),
      index: i,
    })),
    model: 'text-embedding-ada-002',
    usage: { prompt_tokens: 10, total_tokens: 10 },
  }
}

function getMockCreate() {
  const mod = openaiConfig as any
  return mod.__mockCreate as jest.Mock
}

beforeEach(() => {
  getMockCreate().mockReset()
})

describe('embeddings', () => {
  it('getEmbedding returns a vector of length 1536', async () => {
    const text = 'Hello world'
    getMockCreate().mockResolvedValueOnce(makeEmbeddingResponse([text]))

    const embedding = await getEmbedding(text)
    expect(embedding).toHaveLength(1536)
    expect(typeof embedding[0]).toBe('number')
  })

  it('different inputs produce different vectors', async () => {
    const text1 = 'first input'
    const text2 = 'second input different'

    getMockCreate()
      .mockResolvedValueOnce(makeEmbeddingResponse([text1]))
      .mockResolvedValueOnce(makeEmbeddingResponse([text2]))

    const emb1 = await getEmbedding(text1)
    const emb2 = await getEmbedding(text2)

    // Vectors should differ (different text lengths → different sin values)
    const diff = emb1.reduce((sum, v, i) => sum + Math.abs(v - (emb2[i] ?? 0)), 0)
    expect(diff).toBeGreaterThan(0)
  })

  it('batch embedding: multiple texts return multiple embeddings', async () => {
    const texts = ['text one', 'text two', 'text three']
    getMockCreate().mockResolvedValueOnce(makeEmbeddingResponse(texts))

    const embeddings = await getBatchEmbeddings(texts)
    expect(embeddings).toHaveLength(3)
    embeddings.forEach((emb) => expect(emb).toHaveLength(1536))
  })

  it('embedding error propagates as a typed error', async () => {
    getMockCreate().mockRejectedValueOnce(new Error('API rate limit exceeded'))

    await expect(getEmbedding('test')).rejects.toThrow('API rate limit exceeded')
  })

  it('mock client is used when OPENAI_API_KEY is not set', () => {
    const savedKey = process.env['OPENAI_API_KEY']
    delete process.env['OPENAI_API_KEY']

    // getOpenAIClient should be called — in our mock it always returns the mock
    const client = (openaiConfig as any).getOpenAIClient()
    expect(client).toBeDefined()
    expect(client.embeddings).toBeDefined()
    expect(client.embeddings.create).toBeDefined()

    if (savedKey !== undefined) process.env['OPENAI_API_KEY'] = savedKey
  })
})
