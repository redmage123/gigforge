import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'GigForge — AI-Powered Development Agency'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 60%, #1a1040 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              background: '#C9A84C',
              borderRadius: '10px',
              marginRight: '16px',
            }}
          />
          <span
            style={{
              color: '#C9A84C',
              fontSize: '28px',
              fontWeight: '700',
              letterSpacing: '-0.5px',
            }}
          >
            GigForge
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            color: '#ffffff',
            fontSize: '60px',
            fontWeight: '800',
            lineHeight: '1.1',
            maxWidth: '900px',
            marginBottom: '24px',
          }}
        >
          AI-Powered Development Agency
        </div>

        {/* Subline */}
        <div
          style={{
            color: '#94a3b8',
            fontSize: '28px',
            fontWeight: '400',
            maxWidth: '800px',
          }}
        >
          Describe what you need. Our autonomous AI team designs, codes, tests, and ships it.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '6px',
            background: 'linear-gradient(90deg, #C9A84C, #4A90D9)',
          }}
        />
      </div>
    ),
    { ...size }
  )
}
