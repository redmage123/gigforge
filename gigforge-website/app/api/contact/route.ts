import { NextResponse } from 'next/server'

// In-memory dedup cache: submission key → expiry timestamp (ms)
// Prevents duplicate webhook fires for identical email+message within 5 minutes
const submissionCache = new Map<string, number>()
const DEDUP_WINDOW_MS = 5 * 60 * 1000

function getSubmissionKey(email: string, message: string): string {
  const raw = email.toLowerCase().trim() + '::' + message.trim()
  let hash = 5381
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i)
    hash = hash >>> 0 // keep unsigned 32-bit
  }
  return hash.toString(36)
}

interface ContactFormData {
  name: string
  email: string
  message: string
}

interface ValidationErrors {
  name?: string
  email?: string
  message?: string
}

function validateContactForm(data: unknown): { isValid: boolean; errors: ValidationErrors } {
  const errors: ValidationErrors = {}

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: { message: 'Invalid request data' } }
  }

  const formData = data as Partial<ContactFormData>

  if (!formData.name || typeof formData.name !== 'string') {
    errors.name = 'Name is required'
  } else if (formData.name.length < 2) {
    errors.name = 'Name must be at least 2 characters'
  }

  if (!formData.email || typeof formData.email !== 'string') {
    errors.email = 'Email is required'
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      errors.email = 'Please enter a valid email address'
    }
  }

  if (!formData.message || typeof formData.message !== 'string') {
    errors.message = 'Message is required'
  } else if (formData.message.length < 10) {
    errors.message = 'Message must be at least 10 characters'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { isValid, errors } = validateContactForm(body)

    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors },
        { status: 422 }
      )
    }

    const { name, email, message } = body as ContactFormData

    // Idempotency: reject duplicate submissions within the dedup window
    const submissionKey = getSubmissionKey(email, message)
    const now = Date.now()
    for (const [k, expiry] of submissionCache) {
      if (expiry < now) submissionCache.delete(k)
    }
    if (submissionCache.has(submissionKey)) {
      return NextResponse.json({
        success: true,
        message: "Thank you for your interest! Our team will review your request and get back to you shortly.",
      })
    }
    submissionCache.set(submissionKey, now + DEDUP_WINDOW_MS)

    // Post directly to the email gateway webhook to dispatch to gigforge-sales
    // This simulates an inbound email, triggering the full sales pipeline
    const formBody = new URLSearchParams()
    formBody.append('sender', email)
    formBody.append('from', name + ' <' + email + '>')
    formBody.append('recipient', 'gigforge-sales@internal.ai-elevate.ai')
    formBody.append('subject', '[Website Lead] Quote request from ' + name)
    formBody.append('body-plain',
      'NEW LEAD FROM GIGFORGE.AI CONTACT FORM\n\n' +
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n\n' +
      'Message:\n' + message + '\n\n' +
      '---\n' +
      'This lead came from the GigForge website contact form. ' +
      'Respond professionally and promptly. Reply directly to the customer.'
    )
    formBody.append('X-Contact-Form', 'gigforge-website')

    try {
      await fetch('http://host.docker.internal:8065/webhook/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      // Fallback: try localhost (if not in Docker or host.docker.internal not available)
      try {
        await fetch('http://172.17.0.1:8065/webhook/inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody.toString(),
          signal: AbortSignal.timeout(10000),
        })
      } catch {
        // Last resort: try localhost
        await fetch('http://localhost:8065/webhook/inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody.toString(),
          signal: AbortSignal.timeout(10000),
        }).catch(() => {})
      }
    }

    // Also send a notification email to sales team via Mailgun
    const mailgunKey = process.env.MAILGUN_API_KEY
    if (mailgunKey) {
      const notifyBody = new URLSearchParams()
      notifyBody.append('from', 'GigForge Website <noreply@gigforge.ai>')
      notifyBody.append('to', 'peter.munro@ai-elevate.ai')
      notifyBody.append('subject', '[GigForge Lead] New quote request from ' + name)
      notifyBody.append('text',
        'New lead from the GigForge website contact form:\n\n' +
        'Name: ' + name + '\n' +
        'Email: ' + email + '\n\n' +
        'Message:\n' + message + '\n\n' +
        'The sales agent has been notified and will respond automatically.'
      )

      const creds = Buffer.from('api:' + mailgunKey).toString('base64')
      await fetch('https://api.mailgun.net/v3/internal.ai-elevate.ai/messages', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + creds,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: notifyBody.toString(),
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      message: "Thank you for your interest! Our team will review your request and get back to you shortly.",
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Invalid request' },
      { status: 400 }
    )
  }
}
