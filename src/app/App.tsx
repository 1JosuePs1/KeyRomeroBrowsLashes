import Home from '../features/home'
import BookingPage from '../features/booking/BookingPage'
import AdminPage from '../features/admin/AdminPage'

export default function App() {
  if (window.location.pathname === '/reservar') return <BookingPage />
  if (window.location.pathname === '/admin') return <AdminPage />
  return <Home />
}
