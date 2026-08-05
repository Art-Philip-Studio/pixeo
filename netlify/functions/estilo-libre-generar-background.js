// ============================================================
//  estilo-libre-generar-background.js — PASO 2 (segundo plano).
//  Aquí sí llamamos a Gemini y esperamos lo que haga falta: las
//  Background Functions de Netlify tienen hasta 15 minutos, así
//  que no hay riesgo de timeout como en una función normal.
//
//  Nadie llama esto directamente desde el navegador — lo dispara
//  estilo-libre.js. El resultado se guarda en el mismo "job" que
//  el navegador consulta en estilo-libre-estado.js.
// ============================================================

import { getStore } from "@netlify/blobs";

const PROMPT_BASE =
  "You are given two images. The FIRST image is the base photo containing a person. " +
  "The SECOND image is a style reference. Re-render the person from the first image " +
  "applying the artistic style, color palette, lighting mood and overall visual treatment " +
  "of the second image. Preserve the exact facial identity, pose, framing and composition " +
  "of the person in the first image — do not change who they are. Do not add any text, " +
  "watermark, caption or logo. Output only the final image.";

function extraerBase64(dataUri) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri || "");
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default async (req) => {
  const jobs = getStore("estilo-libre-jobs");
  let jobId;
  try {
    const body = await req.json();
    jobId = body.jobId;
    const base = extraerBase64(body.imagenBase);
    const ref = extraerBase64(body.imagenReferencia);
    const variaciones = body.variaciones || 1;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!base || !ref) throw new Error("Formato de imagen inválido");

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
      if (!resp.ok) throw new Error(data?.error?.message || "Gemini rechazó la solicitud");
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p) => p.inlineData || p.inline_data);
      const inline = imgPart?.inlineData || imgPart?.inline_data;
      if (!inline?.data) throw new Error("Gemini no devolvió ninguna imagen");
      const mime = inline.mimeType || inline.mime_type || "image/png";
      return `data:${mime};base64,${inline.data}`;
    };

    const resultados = await Promise.allSettled(
      Array.from({ length: variaciones }, () => llamarGemini())
    );
    const imagenes = resultados.filter((r) => r.status === "fulfilled").map((r) => r.value);

    if (imagenes.length === 0) {
      throw new Error(resultados[0]?.reason?.message || "No se pudo generar ninguna imagen");
    }

    await jobs.setJSON(jobId, { status: "listo", imagenes, terminado: new Date().toISOString() });
  } catch (err) {
    if (jobId) {
      await jobs.setJSON(jobId, { status: "error", error: String(err.message || err) });
    }
  }
};
