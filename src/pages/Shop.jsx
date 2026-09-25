import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import ProductCard from '../components/ProductCard.jsx'
import Reveal from '../components/Reveal.jsx'
import ShopHero from '../components/shop/ShopHero.jsx'
import ShopToolbar from '../components/shop/ShopToolbar.jsx'
import CategoryTiles from '../components/shop/CategoryTiles.jsx'
import ShopSidebar from '../components/shop/ShopSidebar.jsx'
import ActiveFilterChips from '../components/shop/ActiveFilterChips.jsx'
import FilterDrawer from '../components/shop/FilterDrawer.jsx'
import EmptyState from '../components/shop/EmptyState.jsx'
import ProductGridSkeleton from '../components/shop/ProductGridSkeleton.jsx'
import Pagination from '../components/shop/Pagination.jsx'
import ShopMovementCTA from '../components/shop/ShopMovementCTA.jsx'
import { getAllProducts, getCategories, getAllSizes } from '../services/products.js'
import { filterProducts, searchProducts, sortProducts, getDefaultFilters, hasActiveFilters } from '../lib/productQuery.js'
import { getAvailableColors, getProductColors } from '../lib/productColor.js'
import { getCollection, normalizeCollectionSlug, productInCollection } from '../data/collections.js'
import './Shop.css'

const PAGE_SIZE = 8

function Shop() {
  const [allProducts, setAllProducts] = useState(null)
  const [categories, setCategories] = useState([])
  const [sizes, setSizes] = useState([])

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('featured')
  const [filters, setFilters] = useState(getDefaultFilters())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [density, setDensity] = useState('comfort')
  const [page, setPage] = useState(1)

  // Page-local refinements the shared productQuery filters don't model —
  // colour and design-type are derived from product name/tags purely for
  // this page's UI (see lib/productColor.js).
  const [selectedColor, setSelectedColor] = useState(null)
  const [selectedDesigns, setSelectedDesigns] = useState(new Set())

  // The active category lives in the URL (?collection=gen-z) — the single
  // source of truth. That's what lets the homepage tiles deep-link here, and
  // keeps the browser's back button and shared links working.
  const [searchParams, setSearchParams] = useSearchParams()
  const collection = normalizeCollectionSlug(searchParams.get('collection'))
  const collectionInfo = getCollection(collection)

  function setCollection(slug) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (slug === 'all') next.delete('collection')
        else next.set('collection', slug)
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    document.title = collectionInfo ? `${collectionInfo.label} — LAGAMLESS` : 'Shop All — LAGAMLESS'
  }, [collectionInfo])

  // Arriving from a homepage tile: the product grid sits below the hero and
  // tile strip, so bring it into view — otherwise the click looks like it did nothing.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('collection')) {
      document.getElementById('shop-grid')?.scrollIntoView({ block: 'start' })
    }
    // Only on first arrival — later tile clicks stay where the shopper is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const availableColors = useMemo(
    () => (allProducts ? getAvailableColors(allProducts) : []),
    [allProducts],
  )

  const filteredProducts = useMemo(() => {
    if (!allProducts) return []
    const inCollection = allProducts.filter((p) => productInCollection(p, collection))
    const searched = searchProducts(inCollection, search)
    const filtered = filterProducts(searched, filters)
    const byColor = selectedColor
      ? filtered.filter((p) => getProductColors(p).some((c) => c.name === selectedColor))
      : filtered
    const byDesign =
      selectedDesigns.size > 0
        ? byColor.filter((p) =>
            [...selectedDesigns].some((label) =>
              p.tags.includes(label.toLowerCase().replace(/\s+/g, '-')) ||
              p.tags.includes(label.toLowerCase()),
            ),
          )
        : byColor
    return sortProducts(byDesign, sort)
  }, [allProducts, collection, search, filters, sort, selectedColor, selectedDesigns])

  // Reset back to page one whenever the active query shape changes —
  // otherwise the current page could point past the end of a newly
  // narrowed result set.
  const queryKey = JSON.stringify({ collection, search, filters, sort, selectedColor, designs: [...selectedDesigns] })
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey)
  if (prevQueryKey !== queryKey) {
    setPrevQueryKey(queryKey)
    setPage(1)
  }

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const visibleProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function handleClearFilters() {
    setFilters(getDefaultFilters())
    setSearch('')
    setCollection('all')
    setSelectedColor(null)
    setSelectedDesigns(new Set())
  }

  function handleDesignToggle(label) {
    setSelectedDesigns((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  function handlePageChange(next) {
    setPage(next)
    document.getElementById('shop-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isLoading = allProducts === null
  const catalogIsEmpty = !isLoading && allProducts.length === 0
  const noResults = !isLoading && !catalogIsEmpty && filteredProducts.length === 0

  return (
    <>
      <ShopHero productCount={allProducts?.length ?? null} />

      <CategoryTiles onSelect={setCollection} active={collection} />

      <div className="shop-control-bar">
        <Container>
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shop' }]} />
        </Container>
      </div>

      <Section className="shop-page-section" id="shop-grid">
        <Container>
          <div className="shop-layout">
            <ShopSidebar
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearFilters={handleClearFilters}
              sizes={sizes}
              colors={availableColors}
              selectedColor={selectedColor}
              onColorChange={setSelectedColor}
              selectedDesigns={selectedDesigns}
              onDesignToggle={handleDesignToggle}
            />

            <div className="shop-main">
              <ShopToolbar
                title={collectionInfo ? collectionInfo.label : 'All Oversized T-Shirts'}
                sort={sort}
                onSortChange={setSort}
                resultCount={filteredProducts.length}
                onOpenFilters={() => setFiltersOpen(true)}
                filters={filters}
                density={density}
                onDensityChange={setDensity}
              />

              <ActiveFilterChips
                search={search}
                onSearchChange={setSearch}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearAll={handleClearFilters}
                collectionLabel={collectionInfo?.label}
                onClearCollection={() => setCollection('all')}
              />

              <FilterDrawer
                open={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                categories={categories}
                sizes={sizes}
                resultCount={filteredProducts.length}
              />

              {isLoading && <ProductGridSkeleton count={8} />}

              {catalogIsEmpty && (
                <EmptyState
                  title="No products yet."
                  description="The collection is being restocked. Check back shortly."
                />
              )}

              {noResults && collectionInfo && !search.trim() && !hasActiveFilters(filters) && (
                <EmptyState
                  title={`Nothing in ${collectionInfo.label} yet.`}
                  description="New pieces land here as they drop. Browse the full collection in the meantime."
                  actionLabel="View all T-shirts"
                  onAction={() => setCollection('all')}
                />
              )}

              {noResults && !(collectionInfo && !search.trim() && !hasActiveFilters(filters)) && (
                <EmptyState
                  title="No products match your search."
                  description="Try a different search term, or clear your filters to see the full collection."
                  actionLabel="Clear filters"
                  onAction={handleClearFilters}
                />
              )}

              {!isLoading && visibleProducts.length > 0 && (
                <>
                  <div className={`shop-grid shop-grid--${density}`}>
                    {visibleProducts.map((product, index) => (
                      <Reveal key={product.id} delay={Math.min(index, 8) * 40}>
                        <ProductCard product={product} />
                      </Reveal>
                    ))}
                  </div>

                  <Pagination page={page} pageCount={pageCount} onPageChange={handlePageChange} />
                </>
              )}
            </div>
          </div>
        </Container>
      </Section>

      <ShopMovementCTA />
    </>
  )
}

export default Shop
