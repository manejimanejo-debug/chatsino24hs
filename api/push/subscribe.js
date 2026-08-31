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

    const {
      client_id,
      subscription
    } = req.body || {};


    const clientId =
      String(
        client_id || ""
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


    const headers = {

      apikey:
        supabaseKey,

      Authorization:
        `Bearer ${supabaseKey}`,

      "Content-Type":
        "application/json"

    };


    /*
     * =====================================================
     * 1. GUARDAR / ACTUALIZAR LA SUSCRIPCIÓN PUSH
     * =====================================================
     */

    const pushData = {

      client_id:
        clientId,

      endpoint:
        subscription.endpoint,

      p256dh:
        subscription.keys?.p256dh ||
        null,

      auth:
        subscription.keys?.auth ||
        null,

      user_agent:
        req.headers["user-agent"] ||
        null,

      updated_at:
        new Date().toISOString()

    };


    /*
     * Primero comprobamos si ya existe
     * ese endpoint.
     */

    const existingPushResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/push_subscriptions?select=id&endpoint=eq.${encodeURIComponent(subscription.endpoint)}&limit=1`,

        {
          method:
            "GET",

          headers

        }

      );


    const existingPushText =
      await existingPushResponse.text();


    if (
      !existingPushResponse.ok
    ) {

      console.error(
        "Push subscription SELECT:",
        existingPushText
      );

      return res.status(500).json({

        ok: false,

        error:
          "No se pudo comprobar la suscripción"

      });

    }


    const existingPush =
      existingPushText
        ? JSON.parse(
            existingPushText
          )
        : [];


    /*
     * Si ya existe, actualizamos.
     */

    if (
      Array.isArray(existingPush) &&
      existingPush.length > 0
    ) {

      const pushId =
        existingPush[0].id;


      const updatePushResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(pushId)}`,

          {

            method:
              "PATCH",

            headers,

            body:
              JSON.stringify(
                pushData
              )

          }

        );


      const updatePushText =
        await updatePushResponse.text();


      if (
        !updatePushResponse.ok
      ) {

        console.error(
          "Push subscription UPDATE:",
          updatePushText
        );

        return res.status(500).json({

          ok: false,

          error:
            "No se pudo actualizar la suscripción"

        });

      }

    }

    /*
     * Si no existe, creamos.
     */

    else {

      const insertPushResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/push_subscriptions`,

          {

            method:
              "POST",

            headers: {

              ...headers,

              Prefer:
                "return=minimal"

            },

            body:
              JSON.stringify(
                pushData
              )

          }

        );


      const insertPushText =
        await insertPushResponse.text();


      if (
        !insertPushResponse.ok
      ) {

        console.error(
          "Push subscription INSERT:",
          insertPushText
        );

        return res.status(500).json({

          ok: false,

          error:
            "No se pudo guardar la suscripción"

        });

      }

    }


    /*
     * =====================================================
     * 2. ASEGURAR QUE EL CLIENTE EXISTA EN customers
     * =====================================================
     */


    const customerSearchResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/customers?select=id,client_id&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,

        {

          method:
            "GET",

          headers

        }

      );


    const customerSearchText =
      await customerSearchResponse.text();


    if (
      !customerSearchResponse.ok
    ) {

      console.error(
        "Customer SELECT:",
        customerSearchText
      );

      return res.status(500).json({

        ok: false,

        error:
          "No se pudo consultar el cliente"

      });

    }


    const existingCustomer =
      customerSearchText
        ? JSON.parse(
            customerSearchText
          )
        : [];


    /*
     * Si el cliente YA existe,
     * lo marcamos como Push activo.
     */

    if (
      Array.isArray(existingCustomer) &&
      existingCustomer.length > 0
    ) {

      const customerId =
        existingCustomer[0].id;


      const customerUpdateResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}`,

          {

            method:
              "PATCH",

            headers,

            body:
              JSON.stringify({

                push_active:
                  true,

                updated_at:
                  new Date().toISOString()

              })

          }

        );


      const customerUpdateText =
        await customerUpdateResponse.text();


      if (
        !customerUpdateResponse.ok
      ) {

        console.error(
          "Customer UPDATE:",
          customerUpdateText
        );

        return res.status(500).json({

          ok: false,

          error:
            "Se guardó Push pero no se pudo actualizar el cliente"

        });

      }

    }

    /*
     * Si NO existe, lo creamos automáticamente.
     */

    else {

      const customerInsertResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers`,

          {

            method:
              "POST",

            headers: {

              ...headers,

              Prefer:
                "return=minimal"

            },

            body:
              JSON.stringify({

                phone:
                  null,

                client_id:
                  clientId,

                push_active:
                  true,

                created_at:
                  new Date().toISOString(),

                updated_at:
                  new Date().toISOString()

              })

          }

        );


      const customerInsertText =
        await customerInsertResponse.text();


      if (
        !customerInsertResponse.ok
      ) {

        console.error(
          "Customer INSERT:",
          customerInsertText
        );

        return res.status(500).json({

          ok: false,

          error:
            "Se guardó Push pero no se pudo crear el cliente"

        });

      }

    }


    /*
     * =====================================================
     * 3. RESPUESTA FINAL
     * =====================================================
     */

    return res.status(200).json({

      ok:
        true,

      message:
        "Notificaciones activadas",

      client_id:
        clientId,

      push_active:
        true

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
