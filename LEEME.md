# Pixeo — Pago automático con PayPhone + Firebase (un solo camino)

Esto reemplaza el "compra por PayPal + manda captura a WhatsApp" por un cobro
automático: el usuario paga con tarjeta en PayPhone y sus créditos se suman
solos, directo en tu Firebase (`users/{uid}/creditos`) — el mismo lugar
donde ya viven los créditos de login con Google. No hay dos sistemas.

## 0. Primero arregla el error que viste en consola (2 minutos)

`auth/unauthorized-domain` pasa porque tu dominio no está autorizado en Firebase:

1. Ve a [Firebase Console](https://console.firebase.google.com) → proyecto `pixeo-app-7880d`
2. **Authentication → Settings → Authorized domains**
3. Clic en **Add domain** y agrega: `pixeo-app.netlify.app`
4. Si también usas `www.pixeo.com` o `pixeo.com` como dominio final, agrégalos también.

Sin esto, el login con Google va a seguir fallando, con o sin PayPhone.

## 1. Copia estos archivos a tu proyecto

```
netlify/functions/_firebase-admin.js   → nuevo
netlify/functions/crear-pago.js        → nuevo
netlify/functions/confirmar-pago.js    → nuevo
netlify.toml                            → nuevo (en la raíz del sitio)
package.json                            → si ya tienes uno, solo agrega las
                                           dependencias "@netlify/blobs" y
                                           "firebase-admin" (ver abajo)
assets/js/firebase-auth.js             → REEMPLAZA tu archivo actual
```

Si ya tienes un `package.json`, no lo sobreescribas — solo agrégale:
```json
"dependencies": {
  "@netlify/blobs": "^8.1.0",
  "firebase-admin": "^12.6.0"
}
```

## 2. Crea la cuenta de servicio de Firebase (para que el backend pueda sumar créditos)

1. Firebase Console → ⚙️ **Configuración del proyecto → Cuentas de servicio**
2. Clic en **Generar nueva clave privada** → descarga el archivo `.json`
3. Abre ese archivo con un editor de texto y copia **todo** su contenido (es un JSON)

## 3. Variables de entorno en Netlify

Ve a **Netlify → tu sitio → Site configuration → Environment variables** y agrega:

| Variable | Valor |
|---|---|
| `PAYPHONE_TOKEN` | El token de tu cuenta PayPhone Developer (app tipo "WEB") |
| `PAYPHONE_STORE_ID` | El StoreId de esa misma app |
| `FIREBASE_SERVICE_ACCOUNT` | Pega **todo** el JSON del paso 2, tal cual, entre `{ }` |
| `FIREBASE_DATABASE_URL` | `https://pixeo-app-7880d-default-rtdb.firebaseio.com` (ya viene puesto por defecto en el código, esta variable es opcional) |

> Netlify a veces recorta saltos de línea raros al pegar JSON largo. Si al
> desplegar ves errores de "invalid PEM" o similar, convierte el JSON a
> base64 (en tu compu: `base64 -i cuenta-servicio.json`) y pega ese texto
> en `FIREBASE_SERVICE_ACCOUNT` en su lugar — el código detecta ambos formatos.

## 4. Prueba primero en modo sandbox de PayPhone

En tu cuenta de PayPhone Developer, usa las credenciales de **pruebas**
(sandbox) primero, haz una compra de prueba de principio a fin, y confirma
que:
- Te lleva a la pantalla de pago de PayPhone
- Al pagar, vuelve a `app.html` con el mensaje "¡Pago aprobado!"
- El contador de créditos sube solo, sin recargar la página a mano

Cuando todo funcione, cambia `PAYPHONE_TOKEN` y `PAYPHONE_STORE_ID` por tus
credenciales de **producción** en Netlify y vuelve a desplegar.

## 5. Qué cambió en `firebase-auth.js`

- `comprarCreditos(cantidad)` ya no abre PayPal — llama a tu función
  `crear-pago`, que verifica quién eres (con tu sesión de Google) y te
  manda directo a PayPhone.
- Al volver de PayPhone, la página detecta `?pago=exitoso` en la URL,
  muestra el aviso, actualiza el contador de créditos, y limpia la URL.
- Los precios/paquetes (100⭐/$1, 250⭐/$2, 700⭐/$5) son los mismos que ya
  tenías en el modal — si quieres cambiarlos, edita el objeto `PAQUETES`
  en `netlify/functions/crear-pago.js`.

## 6. Qué NO se tocó

- Tu login con Google sigue igual.
- El gasto de créditos al usar herramientas Pro (`FirebaseCreditos.gastar`)
  sigue igual, directo desde el navegador a Firebase — no hace falta
  backend para eso.
- La comunidad, compartir y ganar créditos, etc. — todo intacto.

## 7. Si algo falla en un pago ya aprobado por PayPhone

`confirmar-pago.js` nunca pierde el registro: si falla al escribir en
Firebase (caída momentánea, etc.), el pago aprobado queda registrado en
Netlify Blobs bajo el `clientTransactionId` con el `uid` y los créditos
pendientes, para poder acreditarlo a mano revisando los logs de la función
en Netlify. Esto debería ser muy raro — es solo la red de seguridad.

## 8. NUEVO: Transformar foto con estilo IA (`generar-estilo.js` + `estado-estilo.js`)

Ahora el botón **"Transformar mi foto"** en la página principal (`index.html`)
funciona de verdad, sin redirigir al editor:

- **Quitar fondo** y **Mejorar calidad** siguen 100% gratis, sin login (usan
  tu Worker de Cloudflare de siempre, no se tocó nada ahí).
- **Transformar con estilo IA** (Anime, Cyberpunk, Ghibli, Synthwave, Pixar 3D)
  ahora sí llama a `black-forest-labs/flux-kontext-pro` en Replicate, pide
  login si no ha iniciado sesión, y descuenta **15 créditos** por
  transformación — todo en la misma pantalla, sin salir de `index.html`.
- El descuento de créditos pasa **en el servidor** (`generar-estilo.js`),
  no en el navegador, para que nadie pueda hacer trampa. Si Replicate falla
  o no hay créditos suficientes, no se cobra nada; si falla DESPUÉS de
  haber descontado créditos, `estado-estilo.js` reembolsa automáticamente.
- Como generar una imagen puede tardar más de lo que Netlify permite en una
  sola función, `generar-estilo.js` solo *inicia* la transformación y el
  navegador pregunta el resultado cada ~2.5s en `estado-estilo.js` hasta
  que esté lista.
- Agregué un botón **⬇️ Descargar** (PNG/JPG/WEBP) junto a Quitar fondo /
  Mejorar calidad, disponible para cualquier foto que tengas en pantalla —
  no hace falta pagar nada para descargar el resultado de esas dos
  herramientas gratis.

**Nota sobre el costo:** con tus paquetes actuales (100⭐/$1, 250⭐/$2,
700⭐/$5), cada transformación cuesta a Pixeo ~$0.055 en Replicate. 15
créditos equivalen a $0.11–0.15 según el paquete que compró el usuario, así
que queda un margen sano. Si cambias el costo en créditos, edítalo en la
constante `COSTO_CREDITOS` al inicio de `netlify/functions/generar-estilo.js`.

**La foto de referencia (paso ③, opcional) todavía NO está conectada** —
`flux-kontext-pro` solo soporta una foto + un texto de estilo, no una
segunda imagen de referencia de estilo. Si quieres esa función, hay que
evaluar otro modelo (por ejemplo uno de la familia FLUX.2, que sí soporta
varias imágenes de referencia) — dime y lo armamos aparte.
