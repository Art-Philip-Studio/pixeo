// ============================================================
//  crear-pago.js — Genera un link de pago PayPhone (Botón de Pago)
//  para el usuario que YA inició sesión con Google en Pixeo.
//
//  POST body: { "idToken": "<token de Firebase del usuario>", "paqueteId": "basico" }
//  Respuesta: { "url": "https://pay.payphonetodoesposible.com/..." }
//
//  El idToken se pide con: await firebase.auth().currentUser.getIdToken()
//  Así el servidor sabe con certeza QUIÉN está pagando (nadie puede
//  falsificar el uid) y evitamos pedir correo/contraseña otra vez.
// ============================================================

import { getStore } from "@netlify/blobs";
import { getFirebaseAdmin } from "./_firebase-admin.js";

// Mismos paquetes y precios que ya se muestran hoy en el modal
// "Se acabaron tus créditos" (100=$1, 250=$2, 700=$5).
// Edita aquí si quieres cambiar precios o cantidades.
const PAQUETES = {
  basico:  { creditos: 100, precio: 1.00 },
  popular: { creditos: 250, precio: 2.00 },
  premium: { creditos: 700, precio: 5.00 },
};

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

  const { idToken, paqueteId } = body;
  if (!idToken) {
    return new Response(JSON.stringify({ error: "Falta iniciar sesión" }), { status: 401 });
  }

  const paquete = PAQUETES[paqueteId];
  if (!paquete) {
    return new Response(JSON.stringify({ error: "Paquete inválido" }), { status: 400 });
  }

  let uid;
  try {
    const { auth } = getFirebaseAdmin();
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Sesión inválida o expirada" }), { status: 401 });
  }

  const token   = process.env.PAYPHONE_TOKEN;
  const storeId = process.env.PAYPHONE_STORE_ID;
  const siteUrl = process.env.URL || process.env.SITE_URL;

  if (!token || !storeId || !siteUrl) {
    return new Response(
      JSON.stringify({ error: "Faltan variables de entorno PAYPHONE_TOKEN / PAYPHONE_STORE_ID" }),
      { status: 500 }
    );
  }

  // clientTransactionId: máximo 15 caracteres, único por link
  const clientTransactionId = `PX${Date.now()}`.slice(0, 15);
  const amount = Math.round(paquete.precio * 100); // PayPhone espera centavos

  const payload = {
    amount,
    amountWithoutTax: amount,
    amountWithTax: 0,
    tax: 0,
    service: 0,
    tip: 0,
    currency: "USD",
    storeId,
    clientTransactionId,
    reference: `Pixeo - ${paquete.creditos} creditos`,
    responseUrl: `${siteUrl}/.netlify/functions/confirmar-pago`,
  };

  let data;
  try {
    const resp = await fetch("https://pay.payphonetodoesposible.com/api/button/Prepare", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    data = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "PayPhone rechazó la solicitud", detalle: data }), { status: 502 });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "No se pudo contactar a PayPhone", detalle: String(err) }), { status: 502 });
  }

  const urlPago = data.payWithCard || data.payWithPayPhone;
  if (!urlPago) {
    return new Response(JSON.stringify({ error: "PayPhone no devolvió un link de pago", detalle: data }), { status: 502 });
  }

  // Guardamos la transacción pendiente (uid + créditos) para sumarlos
  // cuando PayPhone confirme el pago. Esto es temporal, no financiero.
  const pendientes = getStore("transacciones-pendientes");
  await pendientes.setJSON(clientTransactionId, {
    uid,
    creditos: paquete.creditos,
    creado: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ url: urlPago }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
