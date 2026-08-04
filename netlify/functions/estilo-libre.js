// ============================================================
//  estilo-libre.js — Copia el estilo de una foto de referencia
//  usando Gemini 2.5 Flash Image ("nano banana"), GRATIS para el
//  usuario (no cobra créditos), con un límite diario para
//  proteger el consumo de la API.
//
//  El usuario NO escribe ningún prompt: sube su foto + una foto
//  de referencia con el estilo que le gusta, y el servidor arma
//  la instrucción automáticamente.
//
//  POST body: {
//    "idToken": "<token de Firebase>",
//    "imagenBase": "data:image/...;base64,....",       // foto del usuario
//    "imagenReferencia": "data:image/...;base64,....",  // foto con el estilo a copiar
//    "variaciones": 2   // opcional, 1-3, default 2
//  }
//  Respuesta: { "imagenes": ["data:image/png;base64,...", ...], "restantes": 3 }
// ============================================================

import { getFirebaseAdmin } from "./_firebase-admin.js";

// Cuántas veces al día puede usar esto GRATIS cada usuario.
// Súbelo o bájalo según cuánto quieras gastar en la API de Gemini.
const LIMITE_DIARIO = 5;
const MAX_VARIACIONES = 3;

const PROMPT_BASE =
  "You are given two images. The FIRST image is the base photo containing a person. " +
  "The SECOND image is a style reference. Re-render the person from the first image " +
  "applying the artistic style, color palette, lighting mood and overall visual treatment " +
  "of the second image. Preserve the exact facial identity, pose, framing and composition " +
  "of the person in the first image — do not change who they are. Do not add any text, " +
  "watermark, caption or logo. Output only the final image.";

function hoyISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function extraerBase64(dataUri) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri || "");
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
  }

  const { idToken, imagenBase, imagenReferencia } = body;
  const variaciones = Math.min(Math.max(parseInt(body.variaciones, 10) || 2, 1), MAX_VARIACIONES);

  if (!idToken) return new Response(JSON.stringify({ error: "Falta iniciar sesión" }), { status: 401 });
  if (!imagenBase) return new Response(JSON.stringify({ error: "Falta tu foto" }), { status: 400 });
  if (!imagenReferencia) return new Response(JSON.stringify({ error: "Falta la foto de referencia" }), { status: 400 });

  const base = extraerBase64(imagenBase);
  const ref = extraerBase64(imagenReferencia);
  if (!base || !ref) return new Response(JSON.stringify({ error: "Formato de imagen inválido" }), { status: 400 });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: "Falta la variable de entorno GEMINI_API_KEY" }), { status: 500 });
  }

  // 1. Verificar sesión y aplicar el límite diario GRATIS (sin tocar créditos).
  let uid, restantes;
  try {
    const { auth, db } = getFirebaseAdmin();
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;

    const usoRef = db.ref(`users/${uid}/usoGratis`);
    const resultado = await usoRef.transaction((actual) => {
      const hoy = hoyISO();
      if (!actual || actual.fecha !== hoy) {
        return { fecha: hoy, conteo: 1 };
      }
      if (actual.conteo >= LIMITE_DIARIO) return; // aborta, sin cambios
      return { fecha: hoy, conteo: actual.conteo + 1 };
    });

    if (!resultado.committed) {
      return new Response(
        JSON.stringify({ error: `Ya usaste tus ${LIMITE_DIARIO} copias gratis de hoy. Vuelve mañana o usa el estilo pagado con más créditos.` }),
        { status: 429 }
      );
    }
    restantes = LIMITE_DIARIO - resultado.snapshot.val().conteo;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Sesión inválida o expirada" }), { status: 401 });
  }

  // 2. Llamar a Gemini 2.5 Flash Image, una vez por variación pedida.
  const llamarGemini = async () => {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT_BASE },
              { inline_data: { mime_type: base.mimeType, data: base.data } },
              { inline_data: { mime_type: ref.mimeType, data: ref.data } },
            ],
          }],
        }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error?.message || "Gemini rechazó la solicitud");
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData || p.inline_data);
    const inline = imgPart?.inlineData || imgPart?.inline_data;
    if (!inline?.data) throw new Error("Gemini no devolvió ninguna imagen");
    const mime = inline.mimeType || inline.mime_type || "image/png";
    return `data:${mime};base64,${inline.data}`;
  };

  try {
    const resultados = await Promise.allSettled(
      Array.from({ length: variaciones }, () => llamarGemini())
    );
    const imagenes = resultados.filter((r) => r.status === "fulfilled").map((r) => r.value);

    if (imagenes.length === 0) {
      throw new Error(resultados[0]?.reason?.message || "No se pudo generar ninguna imagen");
    }

    return new Response(JSON.stringify({ imagenes, restantes }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502 });
  }
};
