export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    console.log("================================");
    console.log("KOMMO WEBHOOK RECIBIDO");
    console.log("================================");

    console.log("Scope ID:", req.query.scope_id);
    console.log("Body:", req.body);

    return res.status(200).json({
      ok: true,
      received: true
    });

  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}
