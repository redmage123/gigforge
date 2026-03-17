import { NextResponse } from 'next/server'
import { Resend } from 'resend'

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

  // Validate name
  if (!formData.name || typeof formData.name !== 'string') {
    errors.name = 'Name is required'
  } else if (formData.name.length < 2) {
    errors.name = 'Name must be at least 2 characters'
  }

  // Validate email
  if (!formData.email || typeof formData.email !== 'string') {
    errors.email = 'Email is required'
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      errors.email = 'Please enter a valid email address'
    }
  }

  // Validate message
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
        {
          success: false,
          message: 'Validation failed',
          errors,
        },
        { status: 422 }
      )
    }

    const { name, email, message } = body as ContactFormData

    // Send email via Resend if API key is configured
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const contactEmail = process.env.CONTACT_EMAIL ?? 'hello@gigforge.ai'

      await resend.emails.send({
        from: 'GigForge Contact <onboarding@resend.dev>',
        to: [contactEmail],
        subject: `New contact form submission from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong></p><p>${message.replace(/\n/g, '<br>')}</p>`,
      })
    }

    return NextResponse.json({
      success: true,
      message: "Thank you, we'll be in touch.",
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: 'Invalid request',
      },
      { status: 400 }
    )
  }
}
