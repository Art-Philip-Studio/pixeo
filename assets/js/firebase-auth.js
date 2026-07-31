/* ── PIXEO — Firebase Auth + Créditos v2 ──────────────────────────
   Sistema completo: login, créditos, compartir, comunidad, PayPal
──────────────────────────────────────────────────────────────────────*/
import { initializeApp }                              from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup,
         signOut, onAuthStateChanged }                from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, set, update, push,
         query, orderByChild, limitToLast }           from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAa-AG3Z3ou6YgIIQDh3yq1o76336rC4rY",
  authDomain:        "pixeo-app-7880d.firebaseapp.com",
  databaseURL:       "https://pixeo-app-7880d-default-rtdb.firebaseio.com",
  projectId:         "pixeo-app-7880d",
  storageBucket:     "pixeo-app-7880d.firebasestorage.app",
  messagingSenderId: "225119050438",
  appId:             "1:225119050438:web:979f943fefbab6c31155c7"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getDatabase(app);
const provider = new GoogleAuthProvider();

const CREDITOS_BIENVENIDA = 100;
let   usuarioActual       = null;

/* ── UI helpers ───────────────────────────────────────────────────── */
function actualizarCreditos(n) {
  document.querySelectorAll('[data-creditos]').forEach(el => {
    el.textContent = Number(n).toLocaleString('es');
  });
  if (window.Creditos) {
    window.Creditos._val    = n;
    window.Creditos.obtener = () => window.Creditos._val ?? 0;
  }
}

function actualizarNavbar(user) {
  const loginBtns  = document.querySelectorAll('[data-pf-login]');
  const logoutArea = document.querySelectorAll('[data-pf-user]');
  const avatares   = document.querySelectorAll('[data-pf-avatar]');
  const nombres    = document.querySelectorAll('[data-pf-nombre]');

  if (user) {
    loginBtns .forEach(el => el.style.display  = 'none');
    logoutArea.forEach(el => el.style.display  = 'flex');
    avatares  .forEach(el => { el.src = user.photoURL || ''; el.style.display = 'block'; });
    nombres   .forEach(el => el.textContent = user.displayName?.split(' ')[0] || 'Tú');
  } else {
    loginBtns .forEach(el => el.style.display  = '');
    logoutArea.forEach(el => el.style.display  = 'none');
    actualizarCreditos(0);
  }
}

/* ── Auth ─────────────────────────────────────────────────────────── */
async function login() {
  try { await signInWithPopup(auth, provider); }
  catch(e) { if (e.code !== 'auth/popup-closed-by-user') console.error(e); }
}
async function logout() { await signOut(auth); }

async function cargarOCrearUsuario(user) {
  const userRef  = ref(db, 'users/' + user.uid);
  const snap     = await get(userRef);
  if (!snap.exists()) {
    await set(userRef, {
      nombre:        user.displayName || 'Usuario',
      email:         user.email,
      foto:          user.photoURL || '',
      creditos:      CREDITOS_BIENVENIDA,
      fechaRegistro: new Date().toISOString(),
      plantillas:    0
    });
    actualizarCreditos(CREDITOS_BIENVENIDA);
    toast(`¡Bienvenido! 🎉 Tienes ${CREDITOS_BIENVENIDA} créditos gratis`, 'success');
  } else {
    actualizarCreditos(snap.val().creditos ?? 0);
  }
}

/* ── Créditos Firebase ───────────────────────────────────────────── */
window.FirebaseCreditos = {
  async obtener() {
    if (!usuarioActual) return 0;
    const s = await get(ref(db, `users/${usuarioActual.uid}/creditos`));
    return s.val() ?? 0;
  },
  async gastar(n) {
    if (!usuarioActual) { abrirModalLogin(); return false; }
    const actual = await this.obtener();
    if (actual < n) { abrirModalSinCreditos(); return false; }
    await update(ref(db, `users/${usuarioActual.uid}`), { creditos: actual - n });
    actualizarCreditos(actual - n);
    return true;
  },
  async agregar(n) {
    if (!usuarioActual) return;
    const actual = await this.obtener();
    const nuevo  = actual + n;
    await update(ref(db, `users/${usuarioActual.uid}`), { creditos: nuevo });
    actualizarCreditos(nuevo);
  },
  async devolver(n) { return this.agregar(n); }
};

function parcharCreditos() {
  if (!window.Creditos) return;
  window.Creditos.gastar   = n => window.FirebaseCreditos.gastar(n);
  window.Creditos.agregar  = n => window.FirebaseCreditos.agregar(n);
  window.Creditos.devolver = n => window.FirebaseCreditos.devolver(n);
  window.Creditos.obtener  = ()  => window.Creditos._val ?? 0;
}

/* ── Compartir y ganar ───────────────────────────────────────────── */
window.compartirYGanar = async function(red) {
  const msgs = {
    twitter:  'Estoy%20dise%C3%B1ando%20con%20IA%20en%20Pixeo%20%F0%9F%9A%80',
    facebook: '',
    whatsapp: 'Mir%C3%A1%20esta%20app%20de%20dise%C3%B1o%20gratis%3A%20'
  };
  const urls = {
    twitter:  `https://twitter.com/intent/tweet?text=${msgs.twitter}&url=https://pixeo.app`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=https://pixeo.app`,
    whatsapp: `https://wa.me/?text=${msgs.whatsapp}https://pixeo.app`
  };
  window.open(urls[red], '_blank', 'width=620,height=420');

  const clave = `compartido_${red}_${new Date().toDateString()}`;
  if (!sessionStorage.getItem(clave)) {
    sessionStorage.setItem(clave, '1');
    await window.FirebaseCreditos.agregar(20);
    toast(`+20 créditos por compartir en ${red} 🎉`, 'success');
  } else {
    toast('Ya compartiste hoy en esta red (mañana puedes volver a ganar)', 'info');
  }
};

/* ── Modal: sin créditos ─────────────────────────────────────────── */
function abrirModalSinCreditos() {
  let m = document.getElementById('pf-modal-creditos');
  if (!m) { m = crearModalSinCreditos(); document.body.appendChild(m); }
  m.style.display = 'flex';
}

function crearModalSinCreditos() {
  const m = document.createElement('div');
  m.id = 'pf-modal-creditos';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;z-index:9999;';
  m.innerHTML = `
    <div style="background:#1a1a2e;border:1px solid #7c5cfc44;border-radius:16px;padding:2rem;max-width:420px;width:90%;text-align:center;color:#fff;">
      <div style="font-size:3rem;margin-bottom:.5rem;">⭐</div>
      <h2 style="font-size:1.4rem;margin:0 0 .5rem;">Se acabaron tus créditos</h2>
      <p style="color:#aaa;font-size:.9rem;margin:0 0 1.5rem;">Elige cómo conseguir más para seguir diseñando</p>

      <div style="display:grid;gap:.75rem;margin-bottom:1.5rem;">

        <div style="background:#0d0d1a;border:1px solid #7c5cfc55;border-radius:10px;padding:1rem;">
          <p style="margin:0 0 .5rem;font-size:.85rem;color:#bbb;">💳 Comprar con tarjeta (PayPhone)</p>
          <div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;">
            <button onclick="window.comprarCreditos(100)" style="background:#7c5cfc;color:#fff;border:none;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.85rem;">100 ⭐ — $1</button>
            <button onclick="window.comprarCreditos(250)" style="background:#7c5cfc;color:#fff;border:none;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.85rem;position:relative;">250 ⭐ — $2 <span style="position:absolute;top:-8px;right:-6px;background:#f97316;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;">Popular</span></button>
            <button onclick="window.comprarCreditos(700)" style="background:#f97316;color:#fff;border:none;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.85rem;">700 ⭐ — $5 🔥</button>
          </div>
          <p style="margin:.5rem 0 0;font-size:.78rem;color:#888;">Pago seguro con tarjeta, acreditación automática e instantánea ⚡</p>
        </div>

        <div style="background:#0d0d1a;border:1px solid #22c55e44;border-radius:10px;padding:1rem;">
          <p style="margin:0 0 .5rem;font-size:.85rem;color:#bbb;">📲 Gratis — Compartir en redes (+20 ⭐ cada una)</p>
          <div style="display:flex;gap:.5rem;justify-content:center;">
            <button onclick="window.compartirYGanar('twitter');cerrarModalCreditos()" style="background:#1da1f2;color:#fff;border:none;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.85rem;">X / Twitter</button>
            <button onclick="window.compartirYGanar('facebook');cerrarModalCreditos()" style="background:#1877f2;color:#fff;border:none;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.85rem;">Facebook</button>
            <button onclick="window.compartirYGanar('whatsapp');cerrarModalCreditos()" style="background:#25d366;color:#fff;border:none;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.85rem;">WhatsApp</button>
          </div>
        </div>

        <div style="background:#0d0d1a;border:1px solid #f9731644;border-radius:10px;padding:1rem;">
          <p style="margin:0 0 .5rem;font-size:.85rem;color:#bbb;">🎨 Publica un diseño en la comunidad (+50 ⭐)</p>
          <button onclick="abrirSubirDiseño();cerrarModalCreditos()" style="background:#f97316;color:#fff;border:none;border-radius:8px;padding:.5rem 1.5rem;cursor:pointer;font-size:.85rem;">Subir mi diseño →</button>
        </div>

      </div>
      <button onclick="cerrarModalCreditos()" style="background:none;border:1px solid #444;color:#aaa;border-radius:8px;padding:.5rem 1.5rem;cursor:pointer;font-size:.85rem;">Ahora no</button>
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) cerrarModalCreditos(); });
  return m;
}

window.cerrarModalCreditos = () => {
  const m = document.getElementById('pf-modal-creditos');
  if (m) m.style.display = 'none';
};

/* ── PayPhone — cobro automático, sin WhatsApp ──────────────────────
   Un solo camino: Google login → Firebase → PayPhone → créditos.
   El backend (netlify/functions/crear-pago.js) verifica el usuario
   con su token de Firebase y arma el link de PayPhone. Cuando
   PayPhone confirma el pago, confirmar-pago.js suma los créditos
   directo en users/{uid}/creditos — el mismo lugar de siempre.
──────────────────────────────────────────────────────────────────*/
const PAYPHONE_PAQUETES = {
  100: 'basico',
  250: 'popular',
  700: 'premium'
};

window.comprarCreditos = async function(cantidad) {
  if (!usuarioActual) { abrirModalLogin(); return; }
  const paqueteId = PAYPHONE_PAQUETES[cantidad];
  if (!paqueteId) return;

  toast('Preparando tu pago con PayPhone…', 'info');
  try {
    const idToken = await usuarioActual.getIdToken();
    const resp = await fetch('/.netlify/functions/crear-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, paqueteId })
    });
    const data = await resp.json();
    if (!resp.ok || !data.url) {
      toast(data.error || 'No se pudo iniciar el pago. Intenta de nuevo.', 'error');
      return;
    }
    // Redirigimos en la misma pestaña: PayPhone necesita volver a
    // /.netlify/functions/confirmar-pago, un popup lo complicaría.
    window.location.href = data.url;
  } catch (err) {
    toast('Error de conexión al iniciar el pago.', 'error');
  }
};

/* Al volver de PayPhone, app.html carga con ?pago=exitoso&creditos=N
   (o ?pago=rechazado / ?pago=error). Mostramos el resultado y
   refrescamos el contador — los créditos ya están en Firebase. */
(function manejarRetornoPayPhone() {
  const params = new URLSearchParams(window.location.search);
  const pago = params.get('pago');
  if (!pago) return;

  if (pago === 'exitoso') {
    const creditos = params.get('creditos');
    toast(creditos ? `¡Pago aprobado! Ahora tienes ${creditos} créditos ⭐` : '¡Pago aprobado! 🎉', 'success');
    if (creditos) actualizarCreditos(Number(creditos));
  } else if (pago === 'rechazado') {
    toast('El pago fue rechazado. No se realizó ningún cobro.', 'error');
  } else {
    toast('Hubo un problema confirmando el pago. Si te cobraron, escríbenos.', 'error');
  }

  // Limpiamos la URL para que no se repita el mensaje al recargar
  params.delete('pago');
  params.delete('creditos');
  const limpio = window.location.pathname + (params.toString() ? `?${params}` : '');
  window.history.replaceState({}, '', limpio);
})();

/* ── Modal: login requerido ─────────────────────────────────────────*/
function abrirModalLogin() {
  let m = document.getElementById('pf-modal-login');
  if (!m) {
    m = document.createElement('div');
    m.id = 'pf-modal-login';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    m.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid #7c5cfc44;border-radius:16px;padding:2rem;max-width:360px;width:90%;text-align:center;color:#fff;">
        <div style="font-size:2.5rem;margin-bottom:.5rem;">🔐</div>
        <h2 style="font-size:1.3rem;margin:0 0 .5rem;">Inicia sesión gratis</h2>
        <p style="color:#aaa;font-size:.9rem;margin:0 0 1.5rem;">Crea tu cuenta y obtén 100 créditos de bienvenida</p>
        <button onclick="window.pixeoLogin();document.getElementById('pf-modal-login').style.display='none'" 
          style="width:100%;background:#7c5cfc;color:#fff;border:none;border-radius:10px;padding:.85rem;font-size:1rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Entrar con Google
        </button>
        <button onclick="document.getElementById('pf-modal-login').style.display='none'" style="margin-top:.75rem;background:none;border:none;color:#666;cursor:pointer;font-size:.85rem;">Ahora no</button>
      </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
    document.body.appendChild(m);
  } else {
    m.style.display = 'flex';
  }
}

/* ── Comunidad: subir diseño ─────────────────────────────────────── */
window.abrirSubirDiseño = function() {
  let m = document.getElementById('pf-modal-subir');
  if (!m) {
    m = document.createElement('div');
    m.id = 'pf-modal-subir';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    m.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid #f9731644;border-radius:16px;padding:2rem;max-width:420px;width:90%;color:#fff;">
        <h2 style="font-size:1.3rem;margin:0 0 .25rem;">🎨 Publicar diseño en la comunidad</h2>
        <p style="color:#aaa;font-size:.85rem;margin:0 0 1.25rem;">Gana <strong style="color:#f97316;">+50 créditos</strong> al publicarlo. Otros usuarios podrán usarlo como plantilla.</p>
        <input id="pf-diseño-titulo" placeholder="Nombre del diseño (ej: Portada YouTube gaming)" 
          style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:8px;padding:.65rem .85rem;color:#fff;font-size:.9rem;box-sizing:border-box;margin-bottom:.75rem;">
        <select id="pf-diseño-categoria" style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:8px;padding:.65rem .85rem;color:#fff;font-size:.9rem;box-sizing:border-box;margin-bottom:.75rem;">
          <option value="">Categoría…</option>
          <option>Redes sociales</option>
          <option>Miniaturas YouTube</option>
          <option>Logos</option>
          <option>Banners</option>
          <option>Presentaciones</option>
          <option>Otro</option>
        </select>
        <label style="display:block;background:#0d0d1a;border:2px dashed #333;border-radius:8px;padding:1.5rem;text-align:center;cursor:pointer;margin-bottom:.75rem;color:#aaa;font-size:.85rem;">
          <input type="file" id="pf-diseño-archivo" accept="image/*" style="display:none" onchange="previewDiseño(this)">
          <span id="pf-preview-txt">📁 Haz clic para subir la imagen del diseño (PNG/JPG)</span>
          <img id="pf-preview-img" style="display:none;max-width:100%;max-height:150px;border-radius:6px;margin-top:.5rem;">
        </label>
        <div style="display:flex;gap:.5rem;">
          <button onclick="publicarDiseño()" style="flex:1;background:#f97316;color:#fff;border:none;border-radius:8px;padding:.75rem;font-weight:600;cursor:pointer;">Publicar y ganar 50 ⭐</button>
          <button onclick="document.getElementById('pf-modal-subir').style.display='none'" style="background:none;border:1px solid #444;color:#aaa;border-radius:8px;padding:.75rem 1rem;cursor:pointer;">Cancelar</button>
        </div>
      </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
    document.body.appendChild(m);
  } else {
    m.style.display = 'flex';
  }
};

window.previewDiseño = function(input) {
  const img = document.getElementById('pf-preview-img');
  const txt = document.getElementById('pf-preview-txt');
  if (input.files[0]) {
    img.src = URL.createObjectURL(input.files[0]);
    img.style.display = 'block';
    txt.style.display = 'none';
  }
};

window.publicarDiseño = async function() {
  if (!usuarioActual) { abrirModalLogin(); return; }
  const titulo     = document.getElementById('pf-diseño-titulo')?.value.trim();
  const categoria  = document.getElementById('pf-diseño-categoria')?.value;
  const archivo    = document.getElementById('pf-diseño-archivo')?.files[0];

  if (!titulo)    { toast('Escribe un nombre para el diseño', 'error'); return; }
  if (!categoria) { toast('Elige una categoría', 'error'); return; }
  if (!archivo)   { toast('Sube una imagen del diseño', 'error'); return; }

  // Convertir imagen a base64 para guardar en Firebase
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    const nuevaPlantilla = {
      titulo,
      categoria,
      imagen:       base64,
      autor:        usuarioActual.displayName || 'Usuario',
      autorId:      usuarioActual.uid,
      autorFoto:    usuarioActual.photoURL || '',
      fecha:        new Date().toISOString(),
      descargas:    0,
      likes:        0
    };
    await push(ref(db, 'comunidad'), nuevaPlantilla);
    await window.FirebaseCreditos.agregar(50);
    document.getElementById('pf-modal-subir').style.display = 'none';
    toast('¡Diseño publicado! +50 créditos 🎉', 'success');
  };
  reader.readAsDataURL(archivo);
};

/* ── Toast ─────────────────────────────────────────────────────────── */
function toast(msg, tipo = 'info') {
  if (window.mostrarToast) { window.mostrarToast(msg, tipo); return; }
  const t = document.createElement('div');
  const colores = { success:'#22c55e', error:'#ef4444', info:'#7c5cfc' };
  t.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;background:${colores[tipo]||colores.info};color:#fff;padding:.75rem 1.25rem;border-radius:10px;font-size:.9rem;z-index:99999;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.3);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ── Estado de sesión ─────────────────────────────────────────────── */
onAuthStateChanged(auth, async user => {
  usuarioActual = user;
  actualizarNavbar(user);
  if (user) {
    await cargarOCrearUsuario(user);
    parcharCreditos();
  }
});

/* ── Exponer globalmente ──────────────────────────────────────────── */
window.pixeoLogin  = login;
window.pixeoLogout = logout;
window.pixeoUser   = () => usuarioActual;
window.abrirModalLogin = abrirModalLogin;
window.abrirModalSinCreditos = abrirModalSinCreditos;
