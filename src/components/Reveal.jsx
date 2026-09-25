import { useEffect, useRef, useState } from 'react'

/**
 * Wraps children in a div that fades/slides into place the first time it
 * enters the viewport. This is the one reveal pattern used across the whole
 * homepage — deliberately reused rather than inventing a different effect
 * per section. Respects prefers-reduced-motion via the CSS transition rules
 * in global.css (durations collapse to ~0 there).
 *
 * Any other prop (e.g. `onMouseEnter`, `aria-*`) is forwarded straight to
 * the rendered tag, same as a plain element would accept.
 *
 * @param {{ children: React.ReactNode, className?: string, delay?: number, as?: string }} props
 */
function Reveal({ children, className = '', delay = 0, as: Tag = 'div', ...rest }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'reveal--visible' : ''} ${className}`.trim()}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export default Reveal
