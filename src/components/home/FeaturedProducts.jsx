import { useEffect, useState } from 'react'
import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Button from '../Button.jsx'
import ProductCard from '../ProductCard.jsx'
import Reveal from '../Reveal.jsx'
import { getFeaturedProducts } from '../../services/products.js'
import './FeaturedProducts.css'

function FeaturedProducts() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    getFeaturedProducts(4).then(setProducts)
  }, [])

  return (
    <Section>
      <Container>
        <div className="featured-products__header">
          <h2 className="text-h2">New arrivals</h2>
          <Button to="/shop" variant="ghost">
            View all
          </Button>
        </div>
        <div className="product-grid">
          {products.map((product, index) => (
            <Reveal key={product.id} delay={index * 60}>
              <ProductCard product={product} index={index} />
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}

export default FeaturedProducts
