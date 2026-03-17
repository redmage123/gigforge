import { createApp } from './app'
import { env } from './config/env'

const app = createApp()

app.listen(env.PORT, () => {
  console.log(`AI Chat Widget server running on port ${env.PORT}`)
  console.log(`Environment: ${env.NODE_ENV}`)
  console.log(`OpenAI: ${env.OPENAI_API_KEY ? 'real client' : 'mock client'}`)
})
