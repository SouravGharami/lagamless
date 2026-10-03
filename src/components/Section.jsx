function Section({ children, tight = false, className = '', ...rest }) {
  const base = tight ? 'section--tight' : 'section'
  return (
    <section className={`${base} ${className}`.trim()} {...rest}>
      {children}
    </section>
  )
}

export default Section
