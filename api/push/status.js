export default async function handler(
  req,
  res
) {

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

      ok:
        false,

      error:
        "Method not allowed"

    });

  }


  try {

    const clientId =
      String(
        req.body?.client_id || ""
      ).trim();


    /*
     * IMPORTANTE:
     *
     * No usamos Boolean() directamente sobre
     * req.body.push_active porque:
     *
     * Boolean("false") === true
     *
     * y eso sería incorrecto.
     */

    const hasPushActive =
      typeof req.body?.push_active !==
      "undefined";


    let pushActive =
      false;


    if (
      hasPushActive
    ) {

      if (
        req.body.push_active === true ||
        req.body.push_active === "true" ||
        req.body.push_active === 1 ||
        req.body.push_active === "1"
      ) {

        pushActive =
          true;

      }

    }


    /*
     * Endpoint Push.
     *
     * Se utiliza cuando el Service Worker detecta
     * que la suscripción cambió/desapareció.
     */

    const endpoint =
      String(
        req.body?.endpoint || ""
      ).trim();


    /*
     * =====================================================
     * SUPABASE
     * =====================================================
     */

    const supabaseUrl =
      process.env.SUPABASE_URL;


    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    if (
      !supabaseUrl ||
      !serviceKey
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
        serviceKey,

      Authorization:
        `Bearer ${serviceKey}`,

      "Content-Type":
        "application/json"

    };


    /*
     * =====================================================
     * MODO 1
     * SINCRONIZAR POR CLIENT_ID
     * =====================================================
     *
     * Lo usa index.html cuando comprueba
     * si el navegador tiene Push activo.
     */

    if (
      clientId &&
      hasPushActive
    ) {

      /*
       * Actualizar cliente.
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

          ok:
            false,

          error:
            "No se pudo actualizar el estado Push."

        });

      }


      /*
       * Si el cliente desactiva Push desde nuestra web,
       * eliminamos todas sus suscripciones.
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

    }


    /*
     * =====================================================
     * MODO 2
     * BAJA POR ENDPOINT
     * =====================================================
     *
     * Lo usa el Service Worker.
     *
     * Ejemplo:
     *
     * {
     *   endpoint: "https://fcm.google.com/..."
     * }
     */

    if (
      endpoint
    ) {

      /*
       * Buscar la suscripción por endpoint.
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

          "Push endpoint SELECT:",

          searchText

        );


        return res.status(500).json({

          ok:
            false,

          error:
            "No se pudo buscar la suscripción Push."

        });

      }


      const rows =
        searchText
          ? JSON.parse(
              searchText
            )
          : [];


      /*
       * Si ya fue eliminada previamente,
       * devolvemos OK.
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
            "La suscripción ya no estaba registrada."

        });

      }


      const subscription =
        rows[0];


      const subscriptionId =
        subscription.id;


      const subscriptionClientId =
        String(
          subscription.client_id ||
          ""
        ).trim();


      /*
       * Eliminar suscripción.
       */

      const deleteResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`,

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

          "Push endpoint DELETE:",

          deleteText

        );


        return res.status(500).json({

          ok:
            false,

          error:
            "No se pudo eliminar la suscripción Push."

        });

      }


      /*
       * =====================================================
       * COMPROBAR SI EL CLIENTE TIENE OTRA SUSCRIPCIÓN
       * =====================================================
       */

      if (
        subscriptionClientId
      ) {

        const remainingResponse =
          await fetch(

            `${supabaseUrl}/rest/v1/push_subscriptions?select=id&client_id=eq.${encodeURIComponent(subscriptionClientId)}&limit=1`,

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
           * Si no tiene ninguna suscripción,
           * lo marcamos como inactivo.
           */

          if (
            !Array.isArray(remaining) ||
            remaining.length === 0
          ) {

            const customerResponse =
              await fetch(

                `${supabaseUrl}/rest/v1/customers?client_id=eq.${encodeURIComponent(subscriptionClientId)}`,

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

                "No se pudo marcar Push como inactivo:",

                customerText

              );

            }

          }

        } else {

          const remainingText =
            await remainingResponse.text();


          console.warn(

            "No se pudo comprobar si quedan suscripciones:",

            remainingText

          );

        }

      }


      return res.status(200).json({

        ok:
          true,

        removed:
          true,

        client_id:
          subscriptionClientId ||
          null

      });

    }


    /*
     * =====================================================
     * DATOS INSUFICIENTES
     * =====================================================
     */

    return res.status(400).json({

      ok:
        false,

      error:
        "Debés enviar client_id + push_active o endpoint."

    });


  } catch (error) {

    console.error(

      "Push status error:",

      error

    );


    return res.status(500).json({

      ok:
        false,

      error:
        error.message ||
        "Internal server error"

    });

  }

}
