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


    const pushActive =
      Boolean(
        req.body?.push_active
      );


    if (
      !clientId
    ) {

      return res.status(400).json({

        ok: false,

        error:
          "client_id es obligatorio"

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
     * Actualizamos el estado del cliente.
     */

    const customerResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/customers?client_id=eq.${encodeURIComponent(clientId)}`,

        {

          method:
            "PATCH",

          headers,

          body:
            JSON.stringify({

              push_active:
                pushActive,

              updated_at:
                new Date().toISOString()

            })

        }

      );


    const customerText =
      await customerResponse.text();


    if (
      !customerResponse.ok
    ) {

      console.error(
        "Customer push status:",
        customerText
      );


      return res.status(500).json({

        ok: false,

        error:
          "No se pudo actualizar el estado Push."

      });

    }


    /*
     * Si el usuario DESACTIVÓ Push,
     * eliminamos sus suscripciones.
     *
     * Esto evita que el broadcast intente
     * enviar posteriormente a ese dispositivo.
     */

    if (
      pushActive === false
    ) {

      const deleteResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/push_subscriptions?client_id=eq.${encodeURIComponent(clientId)}`,

          {

            method:
              "DELETE",

            headers

          }

        );


      const deleteText =
        await deleteResponse.text();


      if (
        !deleteResponse.ok
      ) {

        console.warn(
          "No se pudieron eliminar las suscripciones Push:",
          deleteText
        );

      }

    }


    return res.status(200).json({

      ok:
        true,

      client_id:
        clientId,

      push_active:
        pushActive

    });


  } catch (error) {

    console.error(
      "Push status error:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        "Internal server error"

    });

  }

}
