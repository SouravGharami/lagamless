import { useEffect, useMemo, useState } from 'react'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import ProductCard from '../components/ProductCard.jsx'
import Reveal from '../components/Reveal.jsx'
import ShopToolbar from '../components/shop/ShopToolbar.jsx'
import EmptyState from '../components/shop/EmptyState.jsx'
import ProductGridSkeleton from '../components/shop/ProductGridSkeleton.jsx'
import { getAllProducts, getCategories, getAllSizes } from '../services/products.js'
import { filterProducts, searchProducts, sortProducts, getDefaultFilters } from '../lib/productQuery.js'
import './Shop.css'

function Shop() {
  const [allProducts, setAllProducts] = useState(null)
  const [categories, setCategories] = useState([])
  const [sizes, setSizes] = useState([])

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('featured')
  const [filters, setFilters] = useState(getDefaultFilters())

  useEffect(() => {
    let cancelled = false

    Promise.all([getAllProducts(), getCategories(), getAllSizes()]).then(
      ([products, cats, sizeList]) => {
        if (cancelled) return
        setAllProducts(products)
        setCategories(cats)
        setSizes(sizeList)
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  const visibleProducts = useMemo(() => {
    if (!allProducts) return []
    const searched = searchProducts(allProducts, search)
    const filtered = filterProducts(searched, filters)
    return sortProducts(filtered, sort)
  }, [allProducts, search, filters, sort])

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function handleClearFilters() {
    setFilters(getDefaultFilters())
    setSearch('')
  }

  const isLoading = allProducts === null
  const catalogIsEmpty = !isLoading && allProducts.length === 0
  const noResults = !isLoading && !catalogIsEmpty && visibleProducts.length === 0

  return (
    <Section>
      <Container>
        <div className="shop-header">
          <p className="text-label">Shop</p>
          <h1 className="text-h1 shop-header__title">The full collection.</h1>
          <p className="text-lead shop-header__intro">
            Oversized fits, heavyweight fabrics, and no unnecessary detail. Every piece is built
            to be worn on repeat, not just seen once.
          </p>
        </div>

        <ShopToolbar
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          categories={categories}
          sizes={sizes}
          resultCount={visibleProducts.length}
        />

        {isLoading && <ProductGridSkeleton count={8} />}

        {catalogIsEmpty && (
          <EmptyState
            title="No products yet."
            description="The collection is being restocked. Check back shortly."
          />
        )}

        {noResults && (
          <EmptyState
            title="No products match your search."
            description="Try a different search term, or clear your filters to see the full collection."
            actionLabel="Clear filters"
            onAction={handleClearFilters}
          />
        )}

        {!isLoading && visibleProducts.length > 0 && (
          <div className="shop-grid">
            {visibleProducts.map((product, index) => (
              <Reveal key={product.id} delay={Math.min(index, 8) * 40}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        )}
      </Container>
    </Section>
  )
}

export default Shop
