import { Link } from 'react-router-dom'
import './Footer.css'

const FOOTER_COLUMNS = [
  {
    heading: 'Shop',
    links: [
      { label: 'All Tees', to: '/shop' },
      { label: 'Cotton', to: '/shop' },
      { label: 'Acid Wash', to: '/shop' },
      { label: 'Durga Puja', to: '/shop' },
      { label: 'New Arrivals', to: '/shop' },
    ],
  },
  {
    heading: 'About',
    links: [
      { label: 'Our Story', to: '/about' },
      { label: 'Sustainability', to: '/about' },
      { label: 'Community', to: '/shop' },
      { label: 'Lookbook', to: '/shop' },
      { label: 'Blog', to: '/journal' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'Size Guide', to: '/shop' },
      { label: 'Shipping', to: '/policies/shipping' },
      { label: 'Returns', to: '/policies/returns' },
      { label: 'FAQs', to: '/shop' },
      { label: 'Contact', to: '/contact' },
    ],
  },
]

const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'YouTube', href: 'https://youtube.com' },
  { label: 'Pinterest', href: 'https://pinterest.com' },
  { label: 'Spotify', href: 'https://spotify.com' },
]

function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <span className="footer__wordmark">LAGAMLESS</span>
            <p className="text-small footer__tagline">More than clothing. A culture.</p>
          </div>

          <div className="footer__columns">
            {FOOTER_COLUMNS.map((col) => (
              <div className="footer__column" key={col.heading}>
                <span className="text-label footer__heading">{col.heading}</span>
                <ul>
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to} className="footer__link link-underline">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="footer__mark">
            <span className="footer__monogram">LL</span>
            <p className="footer__quote">
              &ldquo;Different
              <br />
              People
              <br />
              Same Culture.&rdquo;
            </p>
          </div>
        </div>

        <hr className="divider" />

        <div className="footer__bottom">
          <span className="text-small">&copy; {year} LAGAMLESS. All rights reserved.</span>
          <div className="footer__legal">
            <Link to="/policies/privacy" className="footer__legal-link">Privacy Policy</Link>
            <Link to="/policies/privacy" className="footer__legal-link">Terms &amp; Conditions</Link>
          </div>
          <div className="footer__social">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                className="footer__legal-link"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
