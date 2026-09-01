import {
  isAdminAuthenticated
} from "../_lib/admin-auth.js";


export default async function handler(
  req,
  res
) {

  /*
   * =====================================================
   * MÉTODOS PERMITIDOS
   * =====================================================
   *
   * GET   → cargar usuarios
   * PATCH → editar nombre de usuario
   */

  if (
    req.method !== "GET" &&
    req.method !== "PATCH"
  ) {

    return res.status(405).json({

      ok:
        false,

      error:
        "Method not allowed"

    });

  }


  /*
   * =====================================================
   * AUTENTICACIÓN
   * =====================================================
   */

  if (
    !isAdminAuthenticated(req)
  ) {

    return res.status(401).json({

      ok:
        false,

      error:
        "Unauthorized"

    });

  }


  try {

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
        "application/json",

      Accept:
        "application/json"

    };


    /*
     * =====================================================
     * PATCH
     * EDITAR USERNAME
     * =====================================================
     */

    if (
      req.method === "PATCH"
    ) {

      const clientId =
        String(
          req.body?.client_id || ""
        ).trim();


      const username =
        String(
          req.body?.username || ""
        ).trim();


      if (
        !clientId
      ) {

        return res.status(400).json({

          ok:
            false,

          error:
            "client_id es obligatorio"

        });

      }


      if (
        !username
      ) {

        return res.status(400).json({

          ok:
            false,

          error:
            "El nombre de usuario es obligatorio"

        });

      }


      /*
       * Limpiamos espacios.
       */

      const cleanUsername =
        username
          .replace(
            /\s+/g,
            ""
          )
          .trim();


      /*
       * Longitud permitida.
       */

      if (
        cleanUsername.length < 2 ||
        cleanUsername.length > 50
      ) {

        return res.status(400).json({

          ok:
            false,

          error:
            "El nombre de usuario debe tener entre 2 y 50 caracteres."

        });

      }


      /*
       * Caracteres permitidos:
       *
       * letras
       * números
       * punto
       * guión
       * guión bajo
       */

      if (
        !/^[a-zA-Z0-9._-]+$/.test(
          cleanUsername
        )
      ) {

        return res.status(400).json({

          ok:
            false,

          error:
            "El nombre de usuario solo puede contener letras, números, punto, guión y guión bajo."

        });

      }


      /*
       * ===================================================
       * VERIFICAR QUE EL CLIENTE EXISTA
       * ===================================================
       */

      const customerSearchResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?select=id,client_id,username&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,

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

          "Username customer SELECT:",

          customerSearchText

        );


        return res.status(500).json({

          ok:
            false,

          error:
            "No se pudo consultar el cliente."

        });

      }


      const customers =
        customerSearchText
          ? JSON.parse(
              customerSearchText
            )
          : [];


      if (
        !Array.isArray(customers) ||
        customers.length === 0
      ) {

        return res.status(404).json({

          ok:
            false,

          error:
            "El cliente no existe."

        });

      }


      /*
       * ===================================================
       * ACTUALIZAR USERNAME
       * ===================================================
       */

      const updateResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?client_id=eq.${encodeURIComponent(clientId)}`,

          {

            method:
              "PATCH",

            headers: {

              ...headers,

              Prefer:
                "return=representation"

            },

            body:
              JSON.stringify({

                username:
                  cleanUsername,

                updated_at:
                  new Date().toISOString()

              })

          }

        );


      const updateText =
        await updateResponse.text();


      if (
        !updateResponse.ok
      ) {

        console.error(

          "Username UPDATE:",

          updateText

        );


        /*
         * Username duplicado por el índice UNIQUE.
         */

        if (
          updateResponse.status ===
          409
        ) {

          return res.status(409).json({

            ok:
              false,

            error:
              "Ese nombre de usuario ya está registrado por otro cliente."

          });

        }


        return res.status(500).json({

          ok:
            false,

          error:
            "No se pudo actualizar el nombre de usuario."

        });

      }


      return res.status(200).json({

        ok:
          true,

        client_id:
          clientId,

        username:
          cleanUsername

      });

    }


    /*
     * =====================================================
     * GET
     * CARGAR USUARIOS
     * =====================================================
     */

    const customersResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/customers?select=id,phone,username,client_id,created_at,updated_at,push_active&order=created_at.desc&limit=5000`,

        {

          method:
            "GET",

          headers

        }

      );


    if (
      !customersResponse.ok
    ) {

      const text =
        await customersResponse.text();


      console.error(

        "Supabase customers:",

        text

      );


      return res.status(500).json({

        ok:
          false,

        error:
          "No se pudieron obtener los usuarios."

      });

    }


    /*
     * =====================================================
     * SUSCRIPCIONES PUSH
     * =====================================================
     */

    const subscriptionsResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/push_subscriptions?select=id,client_id,endpoint,updated_at`,

        {

          method:
            "GET",

          headers

        }

      );


    if (
      !subscriptionsResponse.ok
    ) {

      const text =
        await subscriptionsResponse.text();


      console.error(

        "Supabase subscriptions:",

        text

      );


      return res.status(500).json({

        ok:
          false,

        error:
          "No se pudieron obtener las suscripciones Push."

      });

    }


    const customers =
      await customersResponse.json();


    const subscriptions =
      await subscriptionsResponse.json();


    /*
     * =====================================================
     * ESTADO REAL DE PUSH
     * =====================================================
     *
     * La existencia de una suscripción real es la
     * fuente de verdad para determinar si Push está activo.
     */

    const activeClientIds =
      new Set(

        subscriptions
          .map(
            row =>
              String(
                row.client_id ||
                ""
              ).trim()
          )
          .filter(Boolean)

      );


    /*
     * =====================================================
     * ARMAR USUARIOS
     * =====================================================
     */

    const users =
      customers.map(
        customer => {

          const clientId =
            String(
              customer.client_id ||
              ""
            ).trim();


          const pushActive =
            activeClientIds.has(
              clientId
            );


          return {

            id:
              customer.id,

            phone:
              customer.phone ||
              null,

            username:
              customer.username ||
              null,

            client_id:
              customer.client_id ||
              null,

            created_at:
              customer.created_at ||
              null,

            updated_at:
              customer.updated_at ||
              null,

            push_active:
              pushActive,

            push_status:
              pushActive
                ? "active"
                : "inactive"

          };

        }

      );


    /*
     * =====================================================
     * CONTADORES
     * ===================================================== */

    const active =
      users.filter(
        user =>
          user.push_active === true
      ).length;


    const inactive =
      users.length -
      active;


    /*
     * =====================================================
     * RESPUESTA
     * ===================================================== */

    return res.status(200).json({

      ok:
        true,

      total:
        users.length,

      active,

      inactive,

      users

    });


  } catch (error) {

    console.error(

      "Admin users:",

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
