import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-bg-secondary mt-auto">
      <div className="max-w-[1280px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-xl font-bold text-text-primary mb-4">GigForge</h3>
            <p className="text-text-secondary">
              Your AI-powered freelance agency
            </p>
          </div>

          <nav className="flex flex-col gap-2">
            <Link href="/" className="text-text-secondary hover:text-accent transition-colors">
              Home
            </Link>
            <Link href="/portfolio" className="text-text-secondary hover:text-accent transition-colors">
              Portfolio
            </Link>
            <Link href="/services" className="text-text-secondary hover:text-accent transition-colors">
              Services
            </Link>
            <Link href="/about" className="text-text-secondary hover:text-accent transition-colors">
              About
            </Link>
            <Link href="/contact" className="text-text-secondary hover:text-accent transition-colors">
              Contact
            </Link>
          </nav>

          <div>
            <p className="text-text-secondary">
            <div className="mb-4 pt-4 border-t border-bg-secondary">
              <p className="text-text-primary text-sm font-semibold mb-1">Subscribe to GigForge Dispatch</p>
              <p className="text-text-secondary text-xs mb-3">Project showcases, tech deep-dives, and AI trends every Tuesday.</p>
              <a href="mailto:newsletter@gigforge.ai?subject=Subscribe&body=Please%20add%20me%20to%20GigForge%20Dispatch" className="inline-block bg-accent text-white text-xs px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">Subscribe</a>
            </div>
              © {currentYear} GigForge. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
