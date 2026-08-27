export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
    const { client_id, subscription } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        ok: false,
        error: "Falta una suscripción push válida"
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Faltan variables de Supabase");

      return res.status(500).json({
        ok: false,
        error: "Servidor no configurado"
      });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions`,
      {
        method: "POST",

        headers: {
          "apikey": supabaseKey,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },

        body: JSON.stringify({
          client_id: client_id || null,
          endpoint: subscription.endpoint,
          subscription: subscription,
          updated_at: new Date().toISOString()
        })
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error("Supabase error:", response.status, text);

      return res.status(500).json({
        ok: false,
        error: "No se pudo guardar la suscripción",
        status: response.status,
        details: text
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Notificaciones activadas"
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}
