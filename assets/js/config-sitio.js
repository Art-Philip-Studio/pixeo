// ============================================================
//  config-sitio.js — Configuración central de Pixeo
//  Cambia aquí el nombre, colores, redes sociales, etc.
//  Este archivo es importado por todos los demás.
// ============================================================

const SITIO = {
  // ── Identidad ──────────────────────────────────────────────
  nombre:      "Pixeo",
  slogan:      "Diseña. Crea. Gana créditos.",
  descripcion: "La plataforma donde tu creatividad tiene valor. Diseña fotos, banners y más — mientras más usas, más herramientas desbloqueas.",
  url:         "https://www.pixeo.com",   // ← cambia por tu dominio real
  logo:        "assets/img/logo.svg",           // ← pon tu logo aquí
  favicon:     "assets/img/favicon.png",

  // ── Colores (CSS variables) ─────────────────────────────────
  colores: {
    primario:    "#FF6B35",   // naranja energético
    secundario:  "#1A1A2E",   // azul noche profundo
    acento:      "#F7C948",   // amarillo dorado (créditos/premios)
    superficie:  "#16213E",   // fondo de tarjetas
    texto:       "#E8E8F0",   // texto principal
    textoSuave:  "#8888AA",   // texto secundario
    exito:       "#4ECDC4",   // verde-azul
    fondo:       "#0F0F1A",   // fondo general oscuro
  },

  // ── Sistema de créditos ─────────────────────────────────────
  creditos: {
    bienvenida:         50,   // créditos al registrarse
    porMinutoActivo:    1,    // crédito por cada minuto de uso
    porDiseno:          5,    // al guardar un diseño
    porCompartir:       10,   // al compartir en redes
    porReferido:        25,   // por cada amigo que invita
    herramientasPro: [        // herramientas que cuestan créditos
      { id: "bg-remove",    nombre: "Eliminar fondo",       costo: 10 },
      { id: "ai-enhance",   nombre: "Mejorar con IA",       costo: 15 },
      { id: "ai-generate",  nombre: "Generar imagen con IA",costo: 20 },
      { id: "video-export", nombre: "Exportar a video",     costo: 30 },
      { id: "hd-export",    nombre: "Exportar en HD 4K",    costo: 8  },
    ],
  },

  // ── Herramientas gratuitas ──────────────────────────────────
  herramientasGratis: [
    { id: "editor",     nombre: "Editor de fotos",    icono: "✏️",  ruta: "app.html" },
    { id: "plantillas", nombre: "Plantillas",          icono: "🎨",  ruta: "app.html?tab=templates" },
    { id: "texto",      nombre: "Agregar texto",       icono: "T",   ruta: "app.html?tab=text" },
    { id: "filtros",    nombre: "Filtros básicos",     icono: "🖼️", ruta: "app.html?tab=filters" },
    { id: "recortar",   nombre: "Recortar",            icono: "✂️",  ruta: "app.html?tab=crop" },
    { id: "stickers",   nombre: "Stickers",            icono: "⭐",  ruta: "app.html?tab=stickers" },
  ],

  // ── Redes sociales ──────────────────────────────────────────
  redes: {
    instagram: "https://instagram.com/pixeo",
    tiktok:    "https://tiktok.com/@pixeo",
    youtube:   "https://youtube.com/@pixeo",
    twitter:   "https://twitter.com/pixeo",
    facebook:  "https://facebook.com/pixeo",
  },

  // ── Navegación principal ────────────────────────────────────
  nav: [
    { texto: "Inicio",      ruta: "index.html" },
    { texto: "Herramientas",ruta: "app.html" },
    { texto: "Blog",        ruta: "blog/index.html" },
    { texto: "Contacto",    ruta: "contacto.html" },
  ],

  // ── SEO y Meta tags ─────────────────────────────────────────
  seo: {
    keywords: [
      "editor de fotos online gratis",
      "diseñar fotos sin descargar",
      "herramienta de diseño gratis",
      "canva alternativa gratis en español",
      "editor de imagenes con inteligencia artificial",
      "crear diseños online",
      "eliminar fondo de foto gratis",
      "mejorar fotos con IA gratis",
      "plantillas de diseño gratis",
      "editar fotos desde el celular",
    ],
    ogImage: "assets/img/og-image.jpg",   // imagen para compartir en redes (1200x630px)
    locale:  "es_ES",
    tipo:    "website",
  },

  // ── Contacto ────────────────────────────────────────────────
  contacto: {
    email:     "hola@pixeo.com",
    soporte:   "soporte@pixeo.com",
    // formspree: "https://formspree.io/f/TU_ID",  // ← descomenta y pon tu ID
  },

  // ── Analytics (opcional) ────────────────────────────────────
  analytics: {
    googleId: "",   // ← ej: "G-XXXXXXXXXX"
    fbPixel:  "",   // ← ej: "123456789"
  },
};

// Exporta para uso en módulos (si usas bundler)
if (typeof module !== "undefined") module.exports = SITIO;