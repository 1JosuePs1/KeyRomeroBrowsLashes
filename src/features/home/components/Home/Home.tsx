import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { business, categories, formatColones, reviews, weeklySchedule } from '../../../../config/business'
import styles from './Home.module.css'
import heroImage from '../../../../assets/img/fotosPesta/2.jpeg'
import galleryOne from '../../../../assets/img/fotosPesta/2.jpeg'
import galleryTwo from '../../../../assets/img/fotosPesta/3.jpeg'
import galleryThree from '../../../../assets/img/fotosPesta/5.jpeg'
import galleryFour from '../../../../assets/img/fotosPesta/4.jpeg'
import galleryFive from '../../../../assets/img/fotosPesta/1.jpeg'
import gallerySix from '../../../../assets/img/fotosPesta/galeria-6.png'
import gallerySeven from '../../../../assets/img/fotosPesta/galeria-7.png'
import galleryEight from '../../../../assets/img/fotosPesta/galeria-8.png'
import galleryNine from '../../../../assets/img/fotosPesta/galeria-9.png'
import galleryTen from '../../../../assets/img/fotosPesta/galeria-10.png'
import headerLogo from '../../../../assets/img/icon/keylin-06.png'

function SectionTitle({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return <><p className={styles.eyebrow}><span />{eyebrow}</p><h2 className={styles.sectionTitle}>{children}</h2></>
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.08 0C5.55 0 .24 5.3.24 11.83c0 2.09.55 4.13 1.59 5.93L.14 24l6.39-1.67a11.8 11.8 0 0 0 5.55 1.4h.01c6.53 0 11.83-5.31 11.83-11.84 0-3.16-1.22-6.13-3.42-8.39Zm-8.42 18.2h-.01a9.82 9.82 0 0 1-5.01-1.37l-.36-.21-3.79.99 1.01-3.7-.23-.38a9.84 9.84 0 1 1 8.39 4.67Zm5.4-7.37c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5a9.1 9.1 0 0 1-1.68-2.09c-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.11 4.52.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" /></svg>
}

function InstagramIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" className={styles.iconFill} /></svg>
}

function TikTokIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3c.3 1.8 1.3 3.2 3.5 3.5v3a8 8 0 0 1-3.5-1.1v6.2a5.4 5.4 0 1 1-4.7-5.3v3a2.4 2.4 0 1 0 1.7 2.3V3h3Z" /></svg>
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false)
  const reviewsRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, scrollLeft: 0 })
  useEffect(() => {
    const timer = window.setInterval(() => {
      const slider = reviewsRef.current
      if (!slider || isDragging.current) return
      const card = slider.querySelector('blockquote')
      const gap = 20
      const nextPosition = slider.scrollLeft + (card?.clientWidth ?? 330) + gap
      if (nextPosition >= slider.scrollWidth - slider.clientWidth - 4) {
        slider.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        slider.scrollTo({ left: nextPosition, behavior: 'smooth' })
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])
  const startDragging = (event: PointerEvent<HTMLDivElement>) => {
    const slider = reviewsRef.current
    if (!slider) return
    isDragging.current = true
    dragStart.current = { x: event.clientX, scrollLeft: slider.scrollLeft }
    slider.setPointerCapture(event.pointerId)
  }
  const dragReviews = (event: PointerEvent<HTMLDivElement>) => {
    const slider = reviewsRef.current
    if (!slider || !isDragging.current) return
    slider.scrollLeft = dragStart.current.scrollLeft - (event.clientX - dragStart.current.x)
  }
  const stopDragging = () => {
    isDragging.current = false
  }
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    '@id': 'https://www.keylinbrowslashes.com/#business',
    name: business.name,
    description: 'Estudio de pestañas, cejas y micropigmentación en Cartago centro, Costa Rica.',
    url: 'https://www.keylinbrowslashes.com/',
    telephone: `+${business.whatsappNumber}`,
    email: business.email,
    image: 'https://www.keylinbrowslashes.com/favicon-512x512.png',
    priceRange: '₡₡',
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address,
      addressLocality: 'Cartago',
      addressRegion: 'Cartago',
      addressCountry: 'CR',
    },
    geo: {
      '@type': 'GeoCoordinates',
      addressCountry: 'CR',
    },
    areaServed: ['Cartago', 'Cartago centro', 'Costa Rica'],
    sameAs: [business.instagram, business.tiktok, business.googleMapsReviewUrl],
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Wednesday', 'Friday'], opens: '12:30', closes: '18:30' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Saturday'], opens: '07:00', closes: '12:30' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Thursday'], opens: '12:30', closes: '18:30' },
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Servicios de pestañas, cejas y micropigmentación',
      itemListElement: categories.map((category) => ({
        '@type': 'OfferCatalog',
        name: category.name,
        itemListElement: category.services.map((service) => ({
          '@type': 'Offer',
          name: service.name,
          priceCurrency: 'CRC',
          price: service.price,
          url: 'https://www.keylinbrowslashes.com/reservar',
        })),
      })),
    },
  }
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className={styles.nav}>
        <a href="#inicio" className={styles.brand}><img src={headerLogo} alt="Keylin Romero" /></a>
        <button className={styles.menuButton} onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú">☰</button>
        <nav className={`${styles.navLinks} ${menuOpen ? styles.navOpen : ''}`}>
          <a href="#servicios" onClick={() => setMenuOpen(false)}>Servicios</a><a href="#galeria" onClick={() => setMenuOpen(false)}>Galería</a><a href="#resenas" onClick={() => setMenuOpen(false)}>Reseñas</a><a href="#ubicacion" onClick={() => setMenuOpen(false)}>Ubicación</a><a className={styles.goldButton} href="/reservar">Agendar cita <span>→</span></a>
        </nav>
      </header>
      <main>
        <section id="inicio" className={styles.hero}><div className={styles.heroCopy}><p className={styles.rating}>★★★★★ <span>+3 500 clientas nos siguen</span></p><h1>Mirada <em>perfecta,</em><br />sin esfuerzo.</h1><p className={styles.lead}>Pestañas pelo a pelo, laminado, henna y micropigmentación de cejas. Un estudio íntimo en Cartago donde cada detalle está pensado para usted.</p><div className={styles.actions}><a className={styles.goldButton} href="/reservar">Agendar mi cita <span>→</span></a><a className={styles.outlineButton} href="#servicios">Ver servicios</a></div><a className={styles.locationLink} href={business.wazeUrl} target="_blank" rel="noreferrer">⌖ {business.city} · frente a Defensa Pública</a></div><div className={styles.heroVisual}><img src={heroImage} alt="Resultado de pestañas de Keylin Romero" /><div className={styles.heroBadge}><strong>5.0</strong><small>Calificación de clientas</small></div></div></section>
        <section id="galeria" className={styles.section}><SectionTitle eyebrow="Galería">Resultados que <em>hablan solos.</em></SectionTitle><div className={styles.gallery}>{[[galleryOne, 'Pestañas híbridas'], [galleryTwo, 'Pestañas 2D'], [galleryThree, 'Micropigmentación'], [galleryFour, 'Cejas y pestañas'], [galleryFive, 'Volumen'], [gallerySix, 'Extensiones de pestañas'], [gallerySeven, 'Diseño de cejas'], [galleryEight, 'Lifting de pestañas'], [galleryNine, 'Pestañas y cejas'], [galleryTen, 'Mirada definida']].map(([src, label], index) => <figure className={`${index % 3 === 1 ? styles.squarePhoto : styles.portraitPhoto} ${styles[`photo${index + 1}`]}`} key={label}><img src={src} alt={label} /><figcaption>{label}</figcaption></figure>)}</div></section>
        <section id="servicios" className={`${styles.section} ${styles.servicesSection}`}><SectionTitle eyebrow="Menú de servicios">Belleza en <em>cada detalle.</em></SectionTitle><div className={styles.serviceCards}>{categories.map((category, index) => <article key={category.id} className={`${styles.serviceCard} ${index === 2 ? styles.darkCard : ''}`}><span className={styles.cardNumber}>0{index + 1}</span><h3>{category.name}</h3><p className={styles.cardMeta}>{category.id === 'micropigmentacion' ? '2 h 30 min' : category.id === 'cejas' ? '1 h' : '1 h 30 min'} · adelanto {formatColones(category.deposit)}</p><ul>{category.services.map((service) => <li key={service.id}><span>{service.name}</span><b>{formatColones(service.price)}</b></li>)}</ul>{category.note && <p className={styles.cardNote}>{category.note} Keylin le enviará los requisitos por WhatsApp unos días antes.</p>}</article>)}</div></section>
        <section id="resenas" className={styles.section}><SectionTitle eyebrow="Reseñas">Lo que dicen <em>mis clientas.</em></SectionTitle><div className={styles.reviewSlider}><div className={styles.reviewGrid} ref={reviewsRef} onPointerDown={startDragging} onPointerMove={dragReviews} onPointerUp={stopDragging} onPointerCancel={stopDragging} onPointerLeave={stopDragging}>{reviews.map((review) => <blockquote key={review.name}><span className={styles.quote}>“</span><p>{review.text}</p><footer>{review.name} <span>★★★★★</span></footer></blockquote>)}</div></div><a className={styles.darkButton} href={business.googleMapsReviewUrl} target="_blank" rel="noreferrer">Dejar reseña en Google Maps</a></section>
        <section id="ubicacion" className={`${styles.section} ${styles.locationSection}`}><SectionTitle eyebrow="Visítenos">Le esperamos en <em>Cartago.</em></SectionTitle><div className={styles.locationGrid}><iframe title="Mapa de Cartago" src="https://www.google.com/maps?q=Tribunales+de+Justicia+Cartago+Costa+Rica&output=embed" loading="lazy" /><div className={styles.locationInfo}><h3>⌖ {business.city}</h3><p>{business.address}</p><a className={styles.goldButton} href={business.wazeUrl} target="_blank" rel="noreferrer">Llegar con Waze</a><div className={styles.hours}><p>Lunes, miércoles y viernes <b>12:30 p. m. – 6:30 p. m.</b></p><p>Martes <b>7:00 a. m. – 12:30 p. m.</b></p><p>Jueves <b>12:30 p. m. – 6:30 p. m.</b></p><p>Sábado <b>{weeklySchedule.saturday}</b></p><p>Domingo <b>{weeklySchedule.sunday}</b></p></div><div className={styles.socialLinks}><a href={business.instagram} target="_blank" rel="noreferrer"><InstagramIcon />Instagram</a><a href={business.tiktok} target="_blank" rel="noreferrer"><TikTokIcon />TikTok</a><a href={`https://wa.me/${business.whatsappNumber}`} target="_blank" rel="noreferrer"><WhatsAppIcon />WhatsApp</a></div></div></div></section>
      </main>
      <footer className={styles.footer}><div className={styles.footerMark}>KR</div><h2>Su mejor versión<br /><em>empieza aquí.</em></h2><div className={styles.footerActions}><a className={styles.goldButton} href="/reservar">Agendar cita</a><a className={styles.emailBadge} href={`mailto:${business.email}`}>✉ <span>{business.email}</span></a></div><p>{business.name} · © 2026 · Cartago centro, Costa Rica</p></footer><a className={styles.whatsapp} href={`https://wa.me/${business.whatsappNumber}`} target="_blank" rel="noreferrer" aria-label="Escribir por WhatsApp"><WhatsAppIcon /></a>
    </div>
  )
}
