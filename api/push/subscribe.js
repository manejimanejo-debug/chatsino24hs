export default async function handler(req, res) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (req.method === "OPTIONS") {

    return res
      .status(200)
      .end();

  }


  if (req.method !== "POST") {

    return res.status(405).json({

      ok: false,

      error:
        "Method not allowed"

    });

  }


  try {

    const {
      client_id,
      subscription
    } = req.body || {};


    if (
      !subscription ||
      !subscription.endpoint
    ) {

      return res.status(400).json({

        ok: false,

        error:
          "Falta una suscripción push válida"

      });

    }


    const supabaseUrl =
      process.env.SUPABASE_URL;


    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    if (
      !supabaseUrl ||
      !supabaseKey
    ) {

      return res.status(500).json({

        ok: false,

        error:
          "Servidor no configurado"

      });

    }


    /*
     * Guardamos únicamente las columnas
     * que existen realmente en
     * push_subscriptions.
     */

    const pushData = {

      client_id:
        client_id || null,

      endpoint:
        subscription.endpoint,

      p256dh:
        subscription.keys?.p256dh ||
        null,

      auth:
        subscription.keys?.auth ||
        null,

      user_agent:
        req.headers[
          "user-agent"
        ] || null,

      updated_at:
        new Date().toISOString()

    };


    const response =
      await fetch(

        `${supabaseUrl}/rest/v1/push_subscriptions`,

        {

          method:
            "POST",

          headers: {

            apikey:
              supabaseKey,

            Authorization:
              `Bearer ${supabaseKey}`,

            "Content-Type":
              "application/json",

            Prefer:
              "resolution=merge-duplicates"

          },

          body:
            JSON.stringify(
              pushData
            )

        }

      );


    const text =
      await response.text();


    if (!response.ok) {

      console.error(
        "Supabase subscribe:",
        text
      );

      return res.status(500).json({

        ok: false,

        error:
          "No se pudo guardar la suscripción"

      });

    }


    /*
     * Si el cliente ya está registrado
     * por teléfono, marcamos su Push
     * como activo.
     */

    if (client_id) {

      const customerResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?client_id=eq.${encodeURIComponent(client_id)}`,

          {

            method:
              "PATCH",

            headers: {

              apikey:
                supabaseKey,

              Authorization:
                `Bearer ${supabaseKey}`,

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify({

                push_active:
                  true,

                updated_at:
                  new Date().toISOString()

              })

          }

        );


      if (
        !customerResponse.ok
      ) {

        console.warn(
          "No se pudo actualizar push_active del cliente."
        );

      }

    }


    return res.status(200).json({

      ok: true,

      message:
        "Notificaciones activadas"

    });


  } catch (error) {

    console.error(
      "Subscribe error:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        "Internal server error"

    });

  }

}
