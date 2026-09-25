import './WhatsAppButton.css'

// Near-universal on Indian D2C sites: a persistent, low-friction way to ask
// a sizing/order question without leaving the site or waiting on email.
// Update WHATSAPP_NUMBER to the real business number (E.164, no + or
// spaces) when one is available.
const WHATSAPP_NUMBER = '910000000000'
const DEFAULT_MESSAGE = "Hi LAGAMLESS, I have a question about an order/product."

function WhatsAppButton() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="whatsapp-fab"
      aria-label="Chat with us on WhatsApp"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.03 3C9.16 3 3.6 8.56 3.6 15.43c0 2.35.65 4.55 1.78 6.44L3 29l7.32-2.34a12.4 12.4 0 0 0 5.7 1.4h.01c6.87 0 12.43-5.56 12.43-12.43C28.46 8.76 22.9 3 16.03 3zm0 22.55h-.01a10.3 10.3 0 0 1-5.26-1.44l-.38-.22-4.34 1.39 1.42-4.23-.25-.4a10.3 10.3 0 0 1-1.58-5.52c0-5.7 4.65-10.34 10.35-10.34 2.77 0 5.36 1.08 7.32 3.04a10.28 10.28 0 0 1 3.03 7.32c0 5.71-4.65 10.4-10.3 10.4zm5.68-7.76c-.31-.16-1.84-.91-2.13-1.01-.29-.11-.5-.16-.71.16-.21.31-.81 1.01-1 1.22-.18.21-.37.23-.68.08-.31-.16-1.32-.49-2.51-1.55-.93-.83-1.56-1.86-1.74-2.17-.18-.31-.02-.48.14-.63.14-.14.31-.37.47-.55.16-.18.21-.31.31-.52.1-.21.05-.39-.02-.55-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55h-.6c-.21 0-.55.08-.84.39-.29.31-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.76.75.32 1.34.51 1.79.66.75.24 1.44.2 1.98.13.6-.09 1.84-.75 2.1-1.48.26-.72.26-1.34.18-1.47-.08-.14-.29-.21-.6-.37z"
        />
      </svg>
    </a>
  )
}

export default WhatsAppButton
