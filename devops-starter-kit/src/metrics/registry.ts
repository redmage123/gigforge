import { Registry } from 'prom-client'

let registry: Registry | null = null

export function getRegistry(): Registry {
  if (!registry) registry = new Registry()
  return registry
}

export function resetRegistry(): void {
  registry = null
}
