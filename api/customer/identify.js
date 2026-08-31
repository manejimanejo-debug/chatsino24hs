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


  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(200)
      .end();

  }


  if (
    req.method !== "POST"
  ) {

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


    if (
      !clientId
    ) {

      return res.status(400).json({

        ok: false,

        error:
          "client_id es obligatorio"

      });

    }


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


    const headers = {

      apikey:
        serviceKey,

      Authorization:
        `Bearer ${serviceKey}`,

      "Content-Type":
        "application/json"

    };


    /*
     * Primero buscamos si ya existe
     * este client_id.
     */

    const searchResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/customers?select=id,client_id,push_active&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,

        {

          method:
            "GET",

          headers

        }

      );


    if (
      !searchResponse.ok
    ) {

      const text =
        await searchResponse.text();


      console.error(
        "Customer search:",
        text
      );


      return res.status(500).json({

        ok: false,

        error:
          "No se pudo consultar el cliente"

      });

    }


    const existing =
      await searchResponse.json();


    /*
     * Si ya existe, solamente
     * actualizamos updated_at.
     */

    if (
      Array.isArray(existing) &&
      existing.length > 0
    ) {

      const customerId =
        existing[0].id;


      const updateResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}`,

          {

            method:
              "PATCH",

            headers,

            body:
              JSON.stringify({

                updated_at:
                  new Date().toISOString()

              })

          }

        );


      if (
        !updateResponse.ok
      ) {

        const text =
          await updateResponse.text();


        console.error(
          "Customer update:",
          text
        );


        return res.status(500).json({

          ok: false,

          error:
            "No se pudo actualizar el cliente"

        });

      }


      return res.status(200).json({

        ok:
          true,

        client_id:
          clientId,

        existing:
          true

      });

    }


    /*
     * Si no existe, lo creamos.
     */

    const insertResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/customers`,

        {

          method:
            "POST",

          headers: {

            ...headers,

            Prefer:
              "return=representation"

          },

          body:
            JSON.stringify({

              client_id:
                clientId,

              phone:
                null,

              push_active:
                false,

              created_at:
                new Date().toISOString(),

              updated_at:
                new Date().toISOString()

            })

        }

      );


    if (
      !insertResponse.ok
    ) {

      const text =
        await insertResponse.text();


      console.error(
        "Customer insert:",
        text
      );


      return res.status(500).json({

        ok: false,

        error:
          "No se pudo crear el cliente"

      });

    }


    return res.status(200).json({

      ok:
        true,

      client_id:
        clientId,

      existing:
        false

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
