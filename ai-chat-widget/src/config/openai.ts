import OpenAI from 'openai'

// Mock client that returns deterministic fake data
function createMockClient() {
  return {
    embeddings: {
      create: async (params: { input: string | string[]; model: string }) => {
        const inputs = Array.isArray(params.input) ? params.input : [params.input]
        return {
          data: inputs.map((text, i) => ({
            embedding: Array.from({ length: 1536 }, (_: unknown, j: number) => Math.sin(text.length + i + j) * 0.1),
            index: i,
          })),
          model: params.model,
          usage: { prompt_tokens: 10, total_tokens: 10 },
        }
      },
    },
    chat: {
      completions: {
        create: async (params: { model: string; messages: unknown[] }) => ({
          id: 'chatcmpl-mock',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'This is a mock response based on the provided context.',
              },
              finish_reason: 'stop',
              index: 0,
            },
          ],
          model: params.model,
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        }),
      },
    },
  }
}

type MockClient = ReturnType<typeof createMockClient>

let client: OpenAI | MockClient | null = null

export function getOpenAIClient(): OpenAI | MockClient {
  if (!client) {
    client = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : createMockClient()
  }
  return client
}

// For testing: reset the singleton
export function resetOpenAIClient(): void {
  client = null
}
