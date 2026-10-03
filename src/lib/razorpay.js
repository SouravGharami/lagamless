/**
 * Loads the Razorpay Checkout.js script on demand (once), rather than in
 * index.html — nothing about it is needed before a customer actually
 * clicks "Pay now", so there's no reason to make every page load fetch and
 * parse a third-party script.
 *
 * @returns {Promise<void>} resolves once `window.Razorpay` is available.
 */
let loadPromise = null

export function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window.'))
  if (window.Razorpay) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Could not load the payment gateway. Check your connection and try again.'))
    }
    document.body.appendChild(script)
  })

  return loadPromise
}
