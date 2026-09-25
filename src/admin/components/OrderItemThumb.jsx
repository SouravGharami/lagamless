/** Small product photo for admin order/return rows, with a neutral placeholder. */
export default function OrderItemThumb({ src, alt = '', size = 48 }) {
  return (
    <span className="admin-order-thumb" style={{ width: size, height: size }}>
      {src ? <img src={src} alt={alt} loading="lazy" /> : <span aria-hidden="true">—</span>}
    </span>
  )
}
