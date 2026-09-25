import { Routes, Route } from 'react-router-dom'
import SiteLayout from './components/SiteLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Shop from './pages/Shop.jsx'
import Product from './pages/Product.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import OrderSuccess from './pages/OrderSuccess.jsx'
import OrderFailed from './pages/OrderFailed.jsx'
import Login from './pages/Login.jsx'
import OrderLookup from './pages/OrderLookup.jsx'
import Signup from './pages/Signup.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Account from './pages/Account.jsx'
import NotFound from './pages/NotFound.jsx'
import AdminRoute from './admin/AdminRoute.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import AdminDashboard from './admin/AdminDashboard.jsx'
import AdminProducts from './admin/pages/AdminProducts.jsx'
import AdminProductNew from './admin/pages/AdminProductNew.jsx'
import AdminProductEdit from './admin/pages/AdminProductEdit.jsx'
import AdminInventory from './admin/pages/AdminInventory.jsx'
import AdminOrders from './admin/pages/AdminOrders.jsx'
import AdminReturns from './admin/pages/AdminReturns.jsx'
import AdminReplacements from './admin/pages/AdminReplacements.jsx'
import AdminCustomers from './admin/pages/AdminCustomers.jsx'
import AdminSettings from './admin/pages/AdminSettings.jsx'

function App() {
  return (
    <Routes>
      {/* Customer-facing site */}
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
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
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
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
  )
}

export default App
