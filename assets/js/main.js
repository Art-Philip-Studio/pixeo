// ============================================================
//  main.js — Pixeo · JavaScript general
//  Maneja: navbar scroll, menú móvil, animaciones fade-up,
//          contador animado de stats, sistema de créditos básico
// ============================================================

/* ── 1. NAVBAR: scroll + hamburguesa ───────────────────────── */
(function () {
  const navbar    = document.querySelector('.navbar');
  const hamburger = document.querySelector('.navbar__hamburguesa');
  const nav       = document.querySelector('.navbar__nav');
  const acciones  = document.querySelector('.navbar__acciones');

  // Scroll: añade clase "scrolled" para el blur
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // estado inicial
  }

  // Hamburguesa móvil
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      const abierto = hamburger.classList.toggle('abierto');
      nav.classList.toggle('abierto', abierto);
      if (acciones) acciones.classList.toggle('abierto', abierto);
      hamburger.setAttribute('aria-expanded', abierto);
      document.body.style.overflow = abierto ? 'hidden' : '';
    });

    // Cierra el menú al hacer clic en un enlace
    nav.querySelectorAll('.navbar__enlace').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('abierto');
        nav.classList.remove('abierto');
        if (acciones) acciones.classList.remove('abierto');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }
})();


/* ── 2. ANIMACIONES: fade-up con IntersectionObserver ──────── */
(function () {
  const elementos = document.querySelectorAll('.fade-up');
  if (!elementos.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target); // solo una vez
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  elementos.forEach(el => observer.observe(el));
})();


/* ── 3. CONTADOR ANIMADO de estadísticas ────────────────────── */
(function () {
  const contadores = document.querySelectorAll('[data-contar]');
  if (!contadores.length) return;

  const animarContador = (el) => {
    const objetivo = parseInt(el.dataset.contar, 10);
    const duracion = 1800; // ms
    const inicio   = performance.now();

    const tick = (ahora) => {
      const progreso = Math.min((ahora - inicio) / duracion, 1);
      // easing ease-out
      const valor = Math.floor(easeOut(progreso) * objetivo);
      el.textContent = valor.toLocaleString('es');
      if (progreso < 1) requestAnimationFrame(tick);
      else el.textContent = objetivo.toLocaleString('es');
    };

    requestAnimationFrame(tick);
  };

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Solo animar cuando el elemento sea visible
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animarContador(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  contadores.forEach(el => observer.observe(el));
})();


/* ── 4. SISTEMA DE CRÉDITOS (localStorage) ──────────────────── */
const Creditos = (function () {
  const CLAVE    = 'pixeo_creditos';
  const INICIO   = (typeof SITIO !== 'undefined' && SITIO.creditos?.bienvenida) ?? 50; // créditos de bienvenida

  // Lee créditos guardados o asigna los de bienvenida
  function obtener() {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === null) {
      localStorage.setItem(CLAVE, INICIO);
      return INICIO;
    }
    return parseInt(guardado, 10) || 0;
  }

  function guardar(valor) {
    localStorage.setItem(CLAVE, Math.max(0, valor));
  }

  function agregar(cantidad) {
    guardar(obtener() + cantidad);
    actualizar();
  }

  function gastar(cantidad) {
    const actual = obtener();
    if (actual < cantidad) return false; // sin saldo
    guardar(actual - cantidad);
    actualizar();
    return true;
  }

  // Actualiza todos los elementos que muestran créditos
  function actualizar() {
    const valor = obtener();
    document.querySelectorAll('[data-creditos]').forEach(el => {
      el.textContent = valor.toLocaleString('es');
    });
  }

  // Acumulación automática DESACTIVADA
  // Los créditos solo se ganan compartiendo en redes (+20) o publicando diseños (+50)
  function iniciarAcumulacion() { /* desactivado */ }

  // Inicializar
  function init() {
    actualizar();
    iniciarAcumulacion();
  }

  return { init, obtener, agregar, gastar, actualizar };
})();

// Arranca el sistema de créditos
document.addEventListener('DOMContentLoaded', () => {
  Creditos.init();
});

// Expone globalmente para uso desde otras páginas (app.html)
window.Creditos = Creditos;


/* ── 5. AÑO DINÁMICO en el footer ──────────────────────────── */
(function () {
  const elAnio = document.getElementById('anio');
  if (elAnio) elAnio.textContent = new Date().getFullYear();
})();


/* ── 6. SMOOTH SCROLL para anclas internas ──────────────────── */
(function () {
  document.querySelectorAll('a[href^="#"]').forEach(enlace => {
    enlace.addEventListener('click', (e) => {
      const id = enlace.getAttribute('href').slice(1);
      const destino = document.getElementById(id);
      if (destino) {
        e.preventDefault();
        const navAlto = parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--nav-alto'),
          10
        ) || 72;
        const top = destino.getBoundingClientRect().top + window.scrollY - navAlto - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
})();


/* ── 7. TOAST de notificaciones ─────────────────────────────── */
window.mostrarToast = function (mensaje, tipo = 'info') {
  // tipo: 'info' | 'exito' | 'error'
  const colores = {
    info:   'var(--primario)',
    exito:  'var(--exito)',
    error:  '#e74c3c',
  };

  const toast = document.createElement('div');
  toast.textContent = mensaje;
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '1.5rem',
    right:        '1.5rem',
    background:   colores[tipo] || colores.info,
    color:        '#fff',
    padding:      '.75rem 1.25rem',
    borderRadius: '12px',
    fontFamily:   'var(--fuente-titulo, sans-serif)',
    fontWeight:   '700',
    fontSize:     '.875rem',
    zIndex:       '9999',
    boxShadow:    '0 8px 32px rgba(0,0,0,.4)',
    transform:    'translateY(20px)',
    opacity:      '0',
    transition:   'all .3s cubic-bezier(.4,0,.2,1)',
  });

  document.body.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateY(0)';
    });
  });

  // Auto-cerrar
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 350);
  }, 3000);
};