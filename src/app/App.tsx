import { useEffect } from 'react'
import Home from '../features/home'
import BookingPage from '../features/booking/BookingPage'
import AdminPage from '../features/admin/AdminPage'

const origin = 'https://www.keylinbrowslashes.com'

const pages: Record<string, { title: string; description: string; robots?: string }> = {
  '/reservar': {
    title: 'Reservar cita de pestañas y cejas en Cartago | Keylin Romero',
    description: 'Agenda tu cita de extensiones de pestañas, laminado, henna o micropigmentación en Cartago centro. Elige tu servicio, fecha y hora en línea.',
  },
  '/admin': {
    title: 'Panel administrativo | Keylin Romero',
    description: 'Acceso privado.',
    robots: 'noindex,nofollow',
  },
}

function setTag(tag: 'meta' | 'link', selector: string, keys: Record<string, string>, attribute: string, value: string) {
  let element = document.head.querySelector<HTMLElement>(selector)
  if (!element) {
    element = document.createElement(tag)
    Object.entries(keys).forEach(([key, keyValue]) => element!.setAttribute(key, keyValue))
    document.head.appendChild(element)
  }
  element.setAttribute(attribute, value)
}

export default function App() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/'

  useEffect(() => {
    const page = pages[pathname]
    if (!page) return
    document.title = page.title
    setTag('meta', 'meta[name="description"]', { name: 'description' }, 'content', page.description)
    setTag('meta', 'meta[property="og:title"]', { property: 'og:title' }, 'content', page.title)
    setTag('meta', 'meta[property="og:description"]', { property: 'og:description' }, 'content', page.description)
    setTag('meta', 'meta[property="og:url"]', { property: 'og:url' }, 'content', `${origin}${pathname}`)
    setTag('link', 'link[rel="canonical"]', { rel: 'canonical' }, 'href', `${origin}${pathname}`)
    if (page.robots) {
      setTag('meta', 'meta[name="robots"]', { name: 'robots' }, 'content', page.robots)
      setTag('meta', 'meta[name="googlebot"]', { name: 'googlebot' }, 'content', page.robots)
    }
  }, [pathname])

  if (pathname === '/reservar') return <BookingPage />
  if (pathname === '/admin') return <AdminPage />
  return <Home />
}
