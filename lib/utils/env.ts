import { z } from 'zod'
const envSchema = z.object({
  SHOPIFY_API_KEY:      z.string().min(1),
  SHOPIFY_API_SECRET:   z.string().min(1),
  SHOPIFY_SCOPES:       z.string().min(1),
  JWT_SECRET:           z.string().min(32),
  ENCRYPTION_KEY:       z.string().length(64),
  NEXT_PUBLIC_APP_URL:  z.string().url(),
  WEBHOOK_BASE_URL:     z.string().url(),
  DATABASE_URL:         z.string().min(1),
})

type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:')
    result.error.issues.forEach(issue => {
      console.error(issue.path.join('.') + ': ' + issue.message)
    })
    throw new Error('Environment validation failed')
  }
  return result.data
}

export const env = typeof window === 'undefined' ? validateEnv() : ({} as Env)
