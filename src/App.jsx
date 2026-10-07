import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop.jsx'
import BrandIntro from './components/intro/BrandIntro.jsx'
import SiteLayout from './components/SiteLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import PageLoader from './components/PageLoader.jsx'

// Route-level code splitting: each page's code is downloaded only when the shopper first goes there,
// so the first load is just the shell + home page (the admin panel never ships to customers at all).
const Shop = lazy(() => import('./pages/Shop.jsx'))
const Collections = lazy(() => import('./pages/Collections.jsx'))
const Story = lazy(() => import('./pages/Story.jsx'))
const ReturnPolicy = lazy(() => import('./pages/ReturnPolicy.jsx'))
const Product = lazy(() => import('./pages/Product.jsx'))
const Cart = lazy(() => import('./pages/Cart.jsx'))
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'))
const Checkout = lazy(() => import('./pages/Checkout.jsx'))
const OrderSuccess = lazy(() => import('./pages/OrderSuccess.jsx'))
const OrderFailed = lazy(() => import('./pages/OrderFailed.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const OrderLookup = lazy(() => import('./pages/OrderLookup.jsx'))
const Signup = lazy(() => import('./pages/Signup.jsx'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const Account = lazy(() => import('./pages/Account.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const AdminRoute = lazy(() => import('./admin/AdminRoute.jsx'))
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard.jsx'))
const AdminProducts = lazy(() => import('./admin/pages/AdminProducts.jsx'))
const AdminProductNew = lazy(() => import('./admin/pages/AdminProductNew.jsx'))
const AdminProductEdit = lazy(() => import('./admin/pages/AdminProductEdit.jsx'))
const AdminInventory = lazy(() => import('./admin/pages/AdminInventory.jsx'))
const AdminOrders = lazy(() => import('./admin/pages/AdminOrders.jsx'))
const AdminReturns = lazy(() => import('./admin/pages/AdminReturns.jsx'))
const AdminReplacements = lazy(() => import('./admin/pages/AdminReplacements.jsx'))
const AdminCustomers = lazy(() => import('./admin/pages/AdminCustomers.jsx'))
const AdminSettings = lazy(() => import('./admin/pages/AdminSettings.jsx'))

/** Safety net for share links (/p/<slug>): the server normally answers these with the preview page first. */
function ShareRedirect() {
  const { slug } = useParams()
  return <Navigate to={`/product/${slug}`} replace />
}

function App() {
  return (
    <>
      <BrandIntro />
      <ScrollToTop />
      <Routes>
        {/* Customer-facing site */}
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/about" element={<Story />} />
          <Route path="/our-story" element={<Navigate to="/about" replace />} />
          <Route path="/policies/returns" element={<ReturnPolicy />} />
          <Route path="/returns" element={<Navigate to="/policies/returns" replace />} />
          <Route path="/return-policy" element={<Navigate to="/policies/returns" replace />} />
          <Route path="/product/:slug" element={<Product />} />
          <Route path="/p/:slug" element={<ShareRedirect />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order/success/:orderId" element={<OrderSuccess />} />
          <Route path="/order/failed/:orderId" element={<OrderFailed />} />
          <Route path="/login" element={<OrderLookup />} />
          {/* Password sign-in — staff/admin, or anyone with a password
              account — deliberately not linked anywhere in the customer UI.
              Reachable only by typing the URL. AdminRoute/ProtectedRoute
              below both redirect here, not to /login. */}
          <Route path="/admin/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Admin panel — same app, isolated layout, gated by AdminRoute */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={<PageLoader full />}>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </Suspense>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/new" element={<AdminProductNew />} />
          <Route path="products/:id/edit" element={<AdminProductEdit />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="returns" element={<AdminReturns />} />
          <Route path="replacements" element={<AdminReplacements />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
