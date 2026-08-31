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

    const clientId =
      String(
        req.body?.client_id || ""
      ).trim();


    if (!clientId) {

      return res.status(400).json({

        ok: false,

        error:
          "client_id es obligatorio"

      });

    }


    /*
     * Evitamos IDs demasiado grandes.
     */

    if (
      clientId.length > 120
    ) {

      return res.status(400).json({

        ok: false,

        error:
          "client_id no válido"

      });

    }


    const supabaseUrl =
      process.env.SUPABASE_URL;


    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    if (
      !supabaseUrl ||
      !serviceKey
    ) {

      return res.status(500).json({

        ok: false,

        error:
          "Supabase no está configurado"

      });

    }


    /*
     * Registramos automáticamente
     * el client_id.
     *
     * El teléfono queda vacío (NULL)
     * hasta que posteriormente
     * decidamos asociarlo.
     */

    const response =
      await fetch(

        `${supabaseUrl}/rest/v1/customers?on_conflict=client_id`,

        {

          method:
            "POST",

          headers: {

            apikey:
              serviceKey,

            Authorization:
              `Bearer ${serviceKey}`,

            "Content-Type":
              "application/json",

            Prefer:
              "resolution=merge-duplicates,return=representation"

          },

          body:
            JSON.stringify({

              client_id:
                clientId,

              updated_at:
                new Date().toISOString()

            })

        }

      );


    if (!response.ok) {

      const text =
        await response.text();


      console.error(

        "Customer identify Supabase:",

        text

      );


      return res.status(500).json({

        ok: false,

        error:
          "No se pudo registrar el client_id"

      });

    }


    return res.status(200).json({

      ok:
        true,

      client_id:
        clientId

    });


  } catch (error) {

    console.error(

      "Customer identify error:",

      error

    );


    return res.status(500).json({

      ok: false,

      error:
        "Internal server error"

    });

  }

}