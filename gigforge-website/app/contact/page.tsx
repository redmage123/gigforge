'use client'

import { useState } from 'react'

interface FormData {
  name: string
  email: string
  message: string
}

interface FormErrors {
  name?: string
  email?: string
  message?: string
}

export default function Contact() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    message: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [serverMessage, setServerMessage] = useState('')

  const validateField = (name: keyof FormData, value: string): string | undefined => {
    if (name === 'name') {
      if (value.length < 2) return 'Name must be at least 2 characters'
    }
    if (name === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(value)) return 'Please enter a valid email address'
    }
    if (name === 'message') {
      if (value.length < 10) return 'Message must be at least 10 characters'
    }
    return undefined
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    const error = validateField(name as keyof FormData, value)
    setErrors((prev) => ({ ...prev, [name]: error }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error on change
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate all fields
    const newErrors: FormErrors = {}
    Object.keys(formData).forEach((key) => {
      const error = validateField(key as keyof FormData, formData[key as keyof FormData])
      if (error) newErrors[key as keyof FormErrors] = error
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setStatus('loading')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setStatus('success')
        setServerMessage(data.message)
        setFormData({ name: '', email: '', message: '' })
      } else {
        setStatus('error')
        setServerMessage(data.message || 'Something went wrong')
        if (data.errors) {
          setErrors(data.errors)
        }
      }
    } catch (error) {
      setStatus('error')
      setServerMessage('Failed to send message. Please try again.')
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-text-primary mb-4">Contact Us</h1>
      <p className="text-xl text-text-secondary mb-12 max-w-3xl">
        Ready to start your project? Fill out the form below and we'll get back to you within 24 hours.
      </p>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-text-primary mb-2 font-semibold">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className="w-full px-4 py-3 bg-bg-secondary text-text-primary rounded-lg border border-transparent focus:border-accent focus:outline-none"
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-red-400 text-sm mt-1">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-text-primary mb-2 font-semibold">
              Email *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className="w-full px-4 py-3 bg-bg-secondary text-text-primary rounded-lg border border-transparent focus:border-accent focus:outline-none"
              aria-invalid={errors.email ? 'true' : 'false'}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-red-400 text-sm mt-1">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="message" className="block text-text-primary mb-2 font-semibold">
              Message *
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              rows={6}
              className="w-full px-4 py-3 bg-bg-secondary text-text-primary rounded-lg border border-transparent focus:border-accent focus:outline-none resize-vertical"
              aria-invalid={errors.message ? 'true' : 'false'}
              aria-describedby={errors.message ? 'message-error' : undefined}
            />
            {errors.message && (
              <p id="message-error" className="text-red-400 text-sm mt-1">
                {errors.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="bg-accent text-text-primary px-8 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Sending...' : 'Send Message'}
          </button>
        </form>

        {status === 'success' && (
          <div className="mt-6 p-4 bg-green-900/30 border border-green-500 rounded-lg">
            <p className="text-green-400">{serverMessage}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500 rounded-lg">
            <p className="text-red-400">{serverMessage}</p>
          </div>
        )}
      </div>
    </div>
  )
}
