import {
  isAdminAuthenticated
} from "../../lib/admin-auth.js";


export default async function handler(
  req,
  res
) {

  /*
   * =====================================================
   * MÉTODOS PERMITIDOS
   * =====================================================
   *
   * GET
   *   → cargar usuarios
   *
   * PATCH
   *   → editar username
   *   → actualizar también el contacto en Kommo
   */

  if (
    req.method !== "GET" &&
    req.method !== "PATCH"
  ) {

    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });

  }


  /*
   * =====================================================
   * AUTENTICACIÓN ADMIN
   * =====================================================
   */

  if (
    !isAdminAuthenticated(req)
  ) {

    return res.status(401).json({
      ok: false,
      error: "Unauthorized"
    });

  }


  try {

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
          req.body?.client_id ||
          ""
        ).trim();


      const username =
        String(
          req.body?.username ||
          ""
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
        !username
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "El nombre de usuario es obligatorio"
        });

      }


      /*
       * ===================================================
       * LIMPIAR USERNAME
       * ===================================================
       */

      const cleanUsername =
        username
          .replace(
            /\s+/g,
            ""
          )
          .trim();


      if (
        cleanUsername.length < 2 ||
        cleanUsername.length > 50
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "El nombre de usuario debe tener entre 2 y 50 caracteres."
        });

      }


      if (
        !/^[a-zA-Z0-9._-]+$/.test(
          cleanUsername
        )
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "El nombre de usuario solo puede contener letras, números, punto, guión y guión bajo."
        });

      }


      /*
       * ===================================================
       * BUSCAR CLIENTE ACTUAL EN SUPABASE
       * ===================================================
       *
       * Importante:
       *
       * Primero obtenemos el username ANTERIOR.
       *
       * Ese username es el que utilizaremos
       * para localizar el contacto correspondiente
       * en Kommo.
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
          ok: false,
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
          ok: false,
          error:
            "El cliente no existe."
        });

      }


      const customer =
        customers[0];


      const oldUsername =
        String(
          customer.username ||
          ""
        ).trim();


      /*
       * ===================================================
       * COMPROBAR USERNAME DUPLICADO
       * ===================================================
       */

      const duplicateResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?select=id,client_id&username=ilike.${encodeURIComponent(cleanUsername)}&limit=10`,

          {
            method:
              "GET",

            headers
          }

        );


      if (
        duplicateResponse.ok
      ) {

        const duplicateCustomers =
          await duplicateResponse.json();


        const anotherCustomer =
          Array.isArray(
            duplicateCustomers
          )
            ? duplicateCustomers.find(
                row =>
                  String(
                    row.client_id ||
                    ""
                  ).trim() !==
                  clientId
              )
            : null;


        if (
          anotherCustomer
        ) {

          return res.status(409).json({
            ok: false,
            error:
              "Ese nombre de usuario ya está registrado por otro cliente."
          });

        }

      }


      /*
       * ===================================================
       * KOMMO
       * ===================================================
       */

      let kommoResult = {
        attempted:
          false,

        updated:
          false,

        contact_id:
          null,

        skipped:
          false,

        error:
          null
      };


      const kommoSubdomain =
        String(
          process.env.KOMMO_SUBDOMAIN ||
          ""
        ).trim();


      const kommoAccessToken =
        String(
          process.env.KOMMO_ACCESS_TOKEN ||
          ""
        ).trim();


      /*
       * Solo intentamos sincronizar con Kommo
       * cuando tenemos configuración y un username
       * anterior.
       */

      if (
        kommoSubdomain &&
        kommoAccessToken &&
        oldUsername
      ) {

        kommoResult.attempted =
          true;


        try {

          /*
           * =================================================
           * BUSCAR CONTACTO EN KOMMO POR NOMBRE
           * =================================================
           *
           * Buscamos el nombre anterior EXACTO.
           */

          const encodedOldName =
            encodeURIComponent(
              oldUsername
            );


          const kommoSearchUrl =
            `https://${kommoSubdomain}.kommo.com/api/v4/contacts?filter%5Bname%5D%5B%5D=${encodedOldName}&limit=250`;


          const kommoSearchResponse =
            await fetch(
              kommoSearchUrl,
              {

                method:
                  "GET",

                headers: {

                  Authorization:
                    `Bearer ${kommoAccessToken}`,

                  Accept:
                    "application/json"

                }

              }
            );


          const kommoSearchText =
            await kommoSearchResponse.text();


          if (
            !kommoSearchResponse.ok
          ) {

            console.error(
              "Kommo SEARCH:",
              kommoSearchResponse.status,
              kommoSearchText
            );

            kommoResult.error =
              `Kommo devolvió ${kommoSearchResponse.status} al buscar el contacto.`;

          } else {

            let kommoSearchData =
              null;


            try {

              kommoSearchData =
                kommoSearchText
                  ? JSON.parse(
                      kommoSearchText
                    )
                  : null;

            } catch (_) {

              kommoSearchData =
                null;

            }


            const contacts =
              kommoSearchData &&
              kommoSearchData._embedded &&
              Array.isArray(
                kommoSearchData
                  ._embedded
                  .contacts
              )
                ? kommoSearchData
                    ._embedded
                    .contacts
                : [];


            /*
             * =================================================
             * ACTUALIZAR CONTACTO(S)
             * =================================================
             */

            if (
              contacts.length ===
              0
            ) {

              kommoResult.skipped =
                true;

              kommoResult.error =
                `No se encontró en Kommo un contacto con el nombre "${oldUsername}".`;

              console.warn(
                "Kommo:",
                kommoResult.error
              );

            } else {

              /*
               * Usamos el primer contacto exacto.
               *
               * En condiciones normales debería ser
               * uno solo porque los usernames son únicos.
               */

              const contact =
                contacts[0];


              const contactId =
                Number(
                  contact.id
                );


              const kommoUpdateUrl =
                `https://${kommoSubdomain}.kommo.com/api/v4/contacts/${contactId}`;


              const kommoUpdateResponse =
                await fetch(
                  kommoUpdateUrl,
                  {

                    method:
                      "PATCH",

                    headers: {

                      Authorization:
                        `Bearer ${kommoAccessToken}`,

                      Accept:
                        "application/json",

                      "Content-Type":
                        "application/json"

                    },

                    body:
                      JSON.stringify({

                        name:
                          cleanUsername

                      })

                  }
                );


              const kommoUpdateText =
                await kommoUpdateResponse.text();


              if (
                !kommoUpdateResponse.ok
              ) {

                console.error(
                  "Kommo UPDATE:",
                  kommoUpdateResponse.status,
                  kommoUpdateText
                );

                kommoResult.error =
                  `Kommo devolvió ${kommoUpdateResponse.status} al actualizar el contacto.`;

              } else {

                kommoResult.updated =
                  true;

                kommoResult.contact_id =
                  contactId;

                console.log(
                  "✅ Kommo actualizado:",
                  contactId,
                  oldUsername,
                  "→",
                  cleanUsername
                );

              }

            }

          }

        } catch (
          kommoError
        ) {

          console.error(
            "Kommo error:",
            kommoError
          );

          kommoResult.error =
            kommoError.message ||
            "Error comunicando con Kommo.";

        }

      } else {

        if (
          !oldUsername
        ) {

          kommoResult.skipped =
            true;

          kommoResult.error =
            "El cliente no tenía username anterior.";

        } else {

          kommoResult.skipped =
            true;

          kommoResult.error =
            "KOMMO_SUBDOMAIN o KOMMO_ACCESS_TOKEN no están configurados.";

        }

      }


      /*
       * ===================================================
       * ACTUALIZAR SUPABASE
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
         * Username duplicado por índice UNIQUE.
         */

        if (
          updateResponse.status ===
          409
        ) {

          return res.status(409).json({
            ok: false,
            error:
              "Ese nombre de usuario ya está registrado por otro cliente."
          });

        }


        return res.status(500).json({
          ok: false,
          error:
            "No se pudo actualizar el nombre de usuario.",
          kommo:
            kommoResult
        });

      }


      /*
       * ===================================================
       * RESPUESTA
       * ===================================================
       */

      return res.status(200).json({

        ok:
          true,

        client_id:
          clientId,

        username:
          cleanUsername,

        old_username:
          oldUsername ||
          null,

        kommo:
          kommoResult

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
        ok: false,
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
        ok: false,
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
     * =====================================================
     */

    const active =
      users.filter(
        user =>
          user.push_active ===
          true
      ).length;


    const inactive =
      users.length -
      active;


    /*
     * =====================================================
     * RESPUESTA GET
     * =====================================================
     */

    return res.status(200).json({

      ok:
        true,

      total:
        users.length,

      active,

      inactive,

      users

    });


  } catch (
    error
  ) {

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
