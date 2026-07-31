// ============================================================
//  confirmar-pago.js — URL de retorno de PayPhone.
//  PayPhone redirige aquí con ?id=...&clientTransactionId=...
//  Confirma la transacción con la API de PayPhone y, si fue
//  aprobada, suma los créditos DIRECTO en Firebase Realtime
//  Database (users/{uid}/creditos) — el mismo lugar que ya usa
//  tu app hoy. Un solo camino, sin sistemas paralelos.
// ============================================================

import { getStore } from "@netlify/blobs";
import { getFirebaseAdmin } from "./_firebase-admin.js";

export default async (req) => {
  const url    = new URL(req.url);
  const id     = url.searchParams.get("id");
  const clientTransactionId = url.searchParams.get("clientTransactionId");
  const siteUrl = process.env.URL || process.env.SITE_URL || "";
  const token   = process.env.PAYPHONE_TOKEN;

  const irApp = (query) => Response.redirect(`${siteUrl}/app.html${query}`, 302);

  if (!id || !clientTransactionId || !token) {
    return irApp("?pago=error");
  }

  let data;
  try {
    const resp = await fetch("https://pay.payphonetodoesposible.com/api/button/V2/Confirm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: Number(id), clientTxId: clientTransactionId }),
    });
    data = await resp.json();

    if (!resp.ok || data.transactionStatus !== "Approved") {
      return irApp("?pago=rechazado");
    }
  } catch (err) {
    return irApp("?pago=error");
  }

  const pendientes = getStore("transacciones-pendientes");
  const procesadas = getStore("transacciones-procesadas");

  // Idempotencia: si PayPhone reintenta el redirect, no sumamos créditos dos veces
  const yaProcesada = await procesadas.get(clientTransactionId);
  if (yaProcesada) {
    return irApp("?pago=exitoso");
  }

  const pendiente = await pendientes.get(clientTransactionId, { type: "json" });
  if (!pendiente) {
    // Se aprobó el pago pero no encontramos a qué usuario sumarle
    // (puede pasar si expiró el registro temporal). Revisa los logs
    // de Netlify con este clientTransactionId para acreditar a mano.
    return irApp("?pago=error");
  }

  try {
    const { db } = getFirebaseAdmin();
    const creditosRef = db.ref(`users/${pendiente.uid}/creditos`);

    // Transacción atómica: evita condiciones de carrera si el usuario
    // gasta créditos justo en el mismo instante en que se confirma el pago.
    const resultado = await creditosRef.transaction((actual) => (actual || 0) + pendiente.creditos);
    const nuevoTotal = resultado.snapshot.val();

    await procesadas.set(clientTransactionId, "1");
    await pendientes.delete(clientTransactionId);

    return irApp(`?pago=exitoso&creditos=${nuevoTotal}`);
  } catch (err) {
    // El pago SÍ fue aprobado por PayPhone pero falló al escribir en
    // Firebase. No perdemos el registro: queda en "pendientes" para
    // poder reintentarlo o acreditar a mano con el clientTransactionId.
    return irApp("?pago=error-acreditando");
  }
};
