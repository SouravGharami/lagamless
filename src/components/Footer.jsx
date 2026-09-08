import { Link } from 'react-router-dom'
import './Footer.css'

const FOOTER_COLUMNS = [
  {
    heading: 'Shop',
    links: [
      { label: 'New arrivals', to: '/shop' },
      { label: 'All products', to: '/shop' },
    ],
  },
  {
    heading: 'About',
    links: [
      { label: 'Our story', to: '/about' },
      { label: 'Journal', to: '/journal' },
    ],
  },
  {
    heading: 'Contact',
    links: [
      { label: 'Support', to: '/contact' },
      { label: 'Store locator', to: '/stores' },
    ],
  },
  {
    heading: 'Policies',
    links: [
      { label: 'Shipping', to: '/policies/shipping' },
      { label: 'Returns', to: '/policies/returns' },
      { label: 'Privacy', to: '/policies/privacy' },
    ],
  },
]

const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'TikTok', href: 'https://tiktok.com' },
  { label: 'YouTube', href: 'https://youtube.com' },
]

function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <span className="footer__wordmark">LAGAMLESS</span>
            <p className="text-small footer__tagline">Oversized, on your terms.</p>
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

            <div className="footer__column">
              <span className="text-label footer__heading">Follow</span>
              <ul>
                {SOCIAL_LINKS.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      className="footer__link link-underline"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <hr className="divider" />

        <div className="footer__bottom">
          <span className="text-small">&copy; {year} LAGAMLESS. All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}

export default Footer
