import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import ProductCard from '../components/ProductCard.jsx'
import Reveal from '../components/Reveal.jsx'
import ShopHero from '../components/shop/ShopHero.jsx'
import ShopToolbar from '../components/shop/ShopToolbar.jsx'
import CollectionGrid from '../components/home/CollectionGrid.jsx'
import CategoryRail from '../components/shop/CategoryRail.jsx'
import ShopSidebar from '../components/shop/ShopSidebar.jsx'
import ActiveFilterChips from '../components/shop/ActiveFilterChips.jsx'
import FilterDrawer from '../components/shop/FilterDrawer.jsx'
import QuickFilters from '../components/shop/QuickFilters.jsx'
import EmptyState from '../components/shop/EmptyState.jsx'
import ProductGridSkeleton from '../components/shop/ProductGridSkeleton.jsx'
import ShopMovementCTA from '../components/shop/ShopMovementCTA.jsx'
import { getAllProducts, getCategories, getAllSizes } from '../services/products.js'
import { filterProducts, searchProducts, sortProducts, getDefaultFilters, hasActiveFilters, getFacetCounts } from '../lib/productQuery.js'
import { useIncremental } from '../lib/useIncremental.js'
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

  // The active category lives in the URL (?collection=gen-z) — the single
  // source of truth. That's what lets the homepage tiles deep-link here, and
  // keeps the browser's back button and shared links working.
  const [searchParams, setSearchParams] = useSearchParams()
  const collection = normalizeCollectionSlug(searchParams.get('collection'))
  const collectionInfo = getCollection(collection)

  // Deep link from <MobileSearchOverlay />'s "View all results" — read the
  // ?q= term once on arrival so it lands in the same `search` state the
  // in-page search box (ActiveFilterChips) uses, then drop it from the URL
  // so it doesn't fight that box's own typing afterwards.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q) {
      setSearch(q)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('q')
          return next
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    // Only on first arrival — later changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tapping a category tile (or a sidebar link) *while already on this page*
  // swaps the URL param without remounting Shop, so the effect above never
  // reruns — the grid re-filters silently below the fold and, on mobile
  // especially, looks like the tap did nothing at all. Bring it into view
  // on every later category change too, smoothly this time since the
  // shopper is already mid-session (the effect above covers the initial,
  // instant jump on arrival). `hasMounted` skips the redundant first run.
  const hasMounted = useRef(false)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    document.getElementById('shop-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [collection])

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

  // Products in the chosen collection that match the search — the pool every filter option is counted against.
  const basePool = useMemo(() => {
    if (!allProducts) return []
    return searchProducts(
      allProducts.filter((p) => productInCollection(p, collection)),
      search,
    )
  }, [allProducts, collection, search])

  const filteredProducts = useMemo(
    () => sortProducts(filterProducts(basePool, filters), sort),
    [basePool, filters, sort],
  )

  // Per-option counts for the filter panel (each count respects every other active filter).
  const facetCounts = useMemo(() => getFacetCounts(basePool, filters, { sizes, categories }), [basePool, filters, sizes, categories])

  // Products appear a batch at a time: the first batch straight away, then more as the shopper scrolls
  // near the bottom of the grid. Any change to the search / filters / sort starts again from the first batch.
  const queryKey = JSON.stringify({ collection, search, filters, sort })
  const { visible: visibleProducts, hasMore, loading: loadingMore, sentinelRef, loadMore, shown } = useIncremental(
    filteredProducts,
    { step: PAGE_SIZE, resetKey: queryKey },
  )

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function handleClearFilters() {
    setFilters(getDefaultFilters())
    setSearch('')
    setCollection('all')
  }

  const isLoading = allProducts === null
  const catalogIsEmpty = !isLoading && allProducts.length === 0
  const noResults = !isLoading && !catalogIsEmpty && filteredProducts.length === 0

  return (
    <>
      <ShopHero productCount={allProducts?.length ?? null} />

      <CollectionGrid variant="shop" activeSlug={collection} />

      {/* One wrapper so the sticky category bar stays pinned only while the shop grid is on screen. */}
      <div className="shop-browse">
      <CategoryRail active={collection} onSelect={setCollection} />

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
              categories={categories}
              counts={facetCounts}
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

              <QuickFilters filters={filters} onFilterChange={handleFilterChange} counts={facetCounts} />

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
                counts={facetCounts}
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

                  {loadingMore && <ProductGridSkeleton count={density === 'compact' ? 4 : 2} />}

                  {/* Invisible marker: when it nears the screen, the next batch is loaded. */}
                  <div ref={sentinelRef} className="shop-load-more" aria-hidden="true" />

                  <p className="shop-load-more__status" role="status">
                    {hasMore ? (
                      <>
                        Showing {shown} of {filteredProducts.length}
                        <button type="button" className="shop-load-more__btn" onClick={loadMore} disabled={loadingMore}>
                          {loadingMore ? 'Loading…' : 'Load more'}
                        </button>
                      </>
                    ) : (
                      filteredProducts.length > PAGE_SIZE && `You've seen all ${filteredProducts.length} pieces`
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </Container>
      </Section>
      </div>

      <ShopMovementCTA />
    </>
  )
}

export default Shop
