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
   * PATCH → editar username + sincronizar Kommo
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
   * AUTENTICACIÓN
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


      /*
       * ===================================================
       * VALIDAR LONGITUD
       * ===================================================
       */

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


      /*
       * ===================================================
       * VALIDAR CARACTERES
       * ===================================================
       */

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
       * BUSCAR CLIENTE EN SUPABASE
       * ===================================================
       *
       * Guardamos el username anterior porque
       * será el nombre que utilizaremos para encontrar
       * el contacto correspondiente en Kommo.
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
       * VERIFICAR USERNAME DUPLICADO
       * ===================================================
       */

      const duplicateResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?select=id,client_id,username&username=ilike.${encodeURIComponent(cleanUsername)}&limit=50`,

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


        if (
          Array.isArray(
            duplicateCustomers
          )
        ) {

          const anotherCustomer =
            duplicateCustomers.find(
              row =>
                String(
                  row.client_id ||
                  ""
                ).trim() !==
                clientId
            );


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

      }


      /*
       * ===================================================
       * RESULTADO DE KOMMO
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


      /*
       * ===================================================
       * CONFIGURACIÓN KOMMO
       * ===================================================
       */

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
       * ===================================================
       * SINCRONIZAR KOMMO
       * ===================================================
       *
       * Para encontrar el contacto usamos el nombre
       * anterior del usuario.
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
           * -------------------------------------------------
           * BUSCAR CONTACTO
           * -------------------------------------------------
           */

          const searchUrl =
            `https://${kommoSubdomain}.kommo.com/api/v4/contacts?query=${encodeURIComponent(oldUsername)}&limit=250`;


          const searchResponse =
            await fetch(
              searchUrl,
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


          const searchText =
            await searchResponse.text();


          if (
            !searchResponse.ok
          ) {

            console.error(
              "Kommo SEARCH:",
              searchResponse.status,
              searchText
            );


            kommoResult.error =
              `Kommo devolvió ${searchResponse.status} al buscar el contacto.`;

          } else {

            let searchData =
              null;


            try {

              searchData =
                searchText
                  ? JSON.parse(
                      searchText
                    )
                  : null;

            } catch (_) {

              searchData =
                null;

            }


            const contacts =
              searchData &&
              searchData._embedded &&
              Array.isArray(
                searchData
                  ._embedded
                  .contacts
              )
                ? searchData
                    ._embedded
                    .contacts
                : [];


            /*
             * -------------------------------------------------
             * BUSCAR COINCIDENCIA EXACTA
             * -------------------------------------------------
             */

            const exactContact =
              contacts.find(
                contact =>
                  String(
                    contact.name ||
                    ""
                  ).trim().toLowerCase() ===
                  oldUsername.toLowerCase()
              );


            /*
             * -------------------------------------------------
             * CONTACTO ENCONTRADO
             * -------------------------------------------------
             */

            const contact =
              exactContact ||
              contacts[0] ||
              null;


            if (
              !contact
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

              const contactId =
                Number(
                  contact.id
                );


              if (
                !Number.isFinite(
                  contactId
                )
              ) {

                kommoResult.error =
                  "El contacto encontrado en Kommo no tiene un ID válido.";

              } else {

                /*
                 * -------------------------------------------------
                 * ACTUALIZAR NOMBRE EN KOMMO
                 * -------------------------------------------------
                 */

                const updateUrl =
                  `https://${kommoSubdomain}.kommo.com/api/v4/contacts/${contactId}`;


                const updateResponse =
                  await fetch(
                    updateUrl,
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


                const updateText =
                  await updateResponse.text();


                if (
                  !updateResponse.ok
                ) {

                  console.error(
                    "Kommo UPDATE:",
                    updateResponse.status,
                    updateText
                  );


                  kommoResult.error =
                    `Kommo devolvió ${updateResponse.status} al actualizar el contacto.`;

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

          }

        } catch (
          kommoError
        ) {

          console.error(
            "Kommo ERROR:",
            kommoError
          );


          kommoResult.error =
            kommoError.message ||
            "Error comunicando con Kommo.";

        }

      } else {

        kommoResult.skipped =
          true;


        if (
          !oldUsername
        ) {

          kommoResult.error =
            "El cliente no tenía username anterior.";

        } else {

          kommoResult.error =
            "Falta configurar KOMMO_SUBDOMAIN o KOMMO_ACCESS_TOKEN.";

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


        if (
          updateResponse.status ===
          409
        ) {

          return res.status(409).json({
            ok: false,
            error:
              "Ese nombre de usuario ya está registrado por otro cliente.",
            kommo:
              kommoResult
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
       * RESPUESTA PATCH
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
     *
     * La existencia de una suscripción real determina
     * si el cliente tiene Push activa.
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
