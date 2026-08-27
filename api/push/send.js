import webpush from "web-push";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Push-Secret");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const secret = req.headers["x-push-secret"];

    if (!secret || secret !== process.env.PUSH_ADMIN_SECRET) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });
    }

    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;

    if (!vapidPrivateKey || !vapidSubject) {
      return res.status(500).json({
        ok: false,
        error: "VAPID no configurado"
      });
    }

    webpush.setVapidDetails(
      vapidSubject,
      process.env.VAPID_PUBLIC_KEY,
      vapidPrivateKey
    );

    const { client_id, title, body, url } = req.body || {};

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        error: "Supabase no configurado"
      });
    }

    let endpointFilter = "";

    if (client_id) {
      endpointFilter = `&client_id=eq.${encodeURIComponent(client_id)}`;
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?select=id,client_id,endpoint,p256dh,auth${endpointFilter}`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();

      console.error("Supabase:", text);

      return res.status(500).json({
        ok: false,
        error: "Error consultando suscripciones"
      });
    }

    const subscriptions = await response.json();

    if (!subscriptions.length) {
      return res.status(404).json({
        ok: false,
        error: "No hay suscripciones"
      });
    }

    const payload = JSON.stringify({
      title: title || "Open 24hs",
      body: body || "Tenés un nuevo mensaje.",
      url: url || "/"
    });

    let sent = 0;
    let failed = 0;

    for (const row of subscriptions) {
      const pushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          payload
        );

        sent++;

      } catch (error) {

        console.error(
          "Error enviando Push:",
          error.statusCode,
          error.body
        );

        failed++;

        // 404/410 = suscripción caducada.
        // Más adelante la eliminaremos automáticamente.
      }
    }

    return res.status(200).json({
      ok: true,
      total: subscriptions.length,
      sent,
      failed
    });

  } catch (error) {

    console.error("Push error:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}
