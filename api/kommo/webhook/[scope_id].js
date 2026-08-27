export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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
    console.log("================================");
    console.log("OPEN 24HS - NOTIFICACION");
    console.log("================================");

    const {
      subscription,
      title,
      body,
      url
    } = req.body || {};

    if (!subscription) {
      return res.status(400).json({
        ok: false,
        error: "Falta subscription"
      });
    }

    if (!subscription.endpoint) {
      return res.status(400).json({
        ok: false,
        error: "Subscription inválida"
      });
    }

    /*
      Por ahora solamente comprobamos
      que la suscripción llegue correctamente.

      En el siguiente paso conectamos
      Web Push real.
    */

    console.log("Endpoint recibido:");
    console.log(subscription.endpoint);

    console.log("Título:", title || "Open 24hs");
    console.log("Mensaje:", body || "Tenés un nuevo mensaje");
    console.log("URL:", url || "/");

    return res.status(200).json({
      ok: true,
      message: "Suscripción recibida correctamente"
    });

  } catch (error) {

    console.error("Error:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}
