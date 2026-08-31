import { isAdminAuthenticated } from "../_lib/admin-auth.js";


export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "same-origin"
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

      ok:
        false,

      error:
        "Method not allowed"

    });

  }


  try {

    /*
     * Este endpoint NO necesita que el navegador
     * envíe contraseña ni cookie.
     *
     * El Service Worker solamente puede mandar
     * el endpoint Push que él mismo conoce.
     */


    const body =
      req.body || {};


    const endpoint =
      String(
        body.endpoint || ""
      ).trim();


    if (
      !endpoint
    ) {

      return res.status(400).json({

        ok:
          false,

        error:
          "Endpoint obligatorio"

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

        ok:
          false,

        error:
          "Supabase no está configurado"

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
     * BUSCAR LA SUSCRIPCIÓN POR ENDPOINT
     * =====================================================
     */

    const searchResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/push_subscriptions?select=id,client_id,endpoint&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`,

        {

          method:
            "GET",

          headers

        }

      );


    const searchText =
      await searchResponse.text();


    if (
      !searchResponse.ok
    ) {

      console.error(

        "Unsubscribe search:",
        searchText

      );


      return res.status(500).json({

        ok:
          false,

        error:
          "No se pudo buscar la suscripción"

      });

    }


    const rows =
      searchText
        ? JSON.parse(
            searchText
          )
        : [];


    /*
     * Si ya no existe, no hay nada que hacer.
     */

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {

      return res.status(200).json({

        ok:
          true,

        removed:
          false,

        message:
          "La suscripción ya no estaba registrada"

      });

    }


    const subscription =
      rows[0];


    const clientId =
      String(
        subscription.client_id ||
        ""
      ).trim();


    /*
     * =====================================================
     * ELIMINAR SUSCRIPCIÓN
     * =====================================================
     */

    const deleteResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`,

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

      console.error(

        "Unsubscribe delete:",
        deleteText

      );


      return res.status(500).json({

        ok:
          false,

        error:
          "No se pudo eliminar la suscripción"

      });

    }


    /*
     * =====================================================
     * COMPROBAR SI EL CLIENTE TIENE OTRA SUSCRIPCIÓN
     * =====================================================
     */

    if (
      clientId
    ) {

      const remainingResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/push_subscriptions?select=id&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,

          {

            method:
              "GET",

            headers

          }

        );


      if (
        remainingResponse.ok
      ) {

        const remaining =
          await remainingResponse.json();


        /*
         * Si no tiene ninguna otra suscripción,
         * Push queda realmente inactivo.
         */

        if (
          !Array.isArray(
            remaining
          ) ||
          remaining.length === 0
        ) {

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
                      false,

                    updated_at:
                      new Date().toISOString()

                  })

              }

            );


          if (
            !customerResponse.ok
          ) {

            const customerText =
              await customerResponse.text();


            console.error(

              "Customer inactive:",
              customerText

            );

          }

        }

      }

    }


    return res.status(200).json({

      ok:
        true,

      removed:
        true,

      client_id:
        clientId || null

    });


  } catch (error) {

    console.error(

      "Unsubscribe error:",
      error

    );


    return res.status(500).json({

      ok:
        false,

      error:
        "Internal server error"

    });

  }

}
