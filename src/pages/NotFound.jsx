import PagePlaceholder from '../components/PagePlaceholder.jsx'

function NotFound() {
  return (
    <PagePlaceholder
      eyebrow="404"
      title="This page doesn't exist."
      description="Check the URL, or head back to the homepage."
    />
  )
}

export default NotFound
