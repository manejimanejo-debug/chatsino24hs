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
       * =====================================================
       * SINCRONIZAR NOMBRE EN KOMMO
       * =====================================================
       *
       * El cambio debe quedar confirmado en Kommo antes de
       * actualizar Supabase. Así evitamos que ambos sistemas
       * queden con nombres diferentes si Kommo rechaza el cambio.
       */

      let kommoResult = {
        attempted: false,
        updated: false,
        contact_id: null,
        old_username: oldUsername || null,
        new_username: cleanUsername,
        skipped: false,
        error: null
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


      if (
        !kommoSubdomain ||
        !kommoAccessToken
      ) {

        return res.status(500).json({
          ok: false,
          error:
            "Kommo no está configurado en Vercel. Verificá KOMMO_SUBDOMAIN y KOMMO_ACCESS_TOKEN y hacé un nuevo Deploy.",
          kommo: {
            attempted: false,
            updated: false,
            error:
              "Faltan variables de entorno de Kommo."
          }
        });

      }


      if (
        !oldUsername
      ) {

        kommoResult.skipped =
          true;

        kommoResult.error =
          "El cliente todavía no tenía username anterior.";

      } else {

        kommoResult.attempted =
          true;


        try {

          const kommoBaseUrl =
            `https://${kommoSubdomain}.kommo.com/api/v4`;


          const authHeaders = {

            Authorization:
              `Bearer ${kommoAccessToken}`,

            Accept:
              "application/json"

          };


          /*
           * -------------------------------------------------
           * BUSCAR CONTACTO EN KOMMO
           * -------------------------------------------------
           */

          const searchResponse =
            await fetch(

              `${kommoBaseUrl}/contacts?query=${encodeURIComponent(oldUsername)}&limit=250`,

              {
                method:
                  "GET",

                headers:
                  authHeaders
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


            return res.status(502).json({
              ok: false,
              error:
                "No se pudo sincronizar el nombre con Kommo.",
              kommo:
                kommoResult
            });

          }


          let searchData =
            null;


          try {

            searchData =
              searchText
                ? JSON.parse(
                    searchText
                  )
                : null;

          } catch (
            parseError
          ) {

            console.error(
              "Kommo SEARCH JSON:",
              parseError
            );


            kommoResult.error =
              "Kommo respondió con datos inválidos al buscar el contacto.";


            return res.status(502).json({
              ok: false,
              error:
                "Kommo respondió con un formato inesperado.",
              kommo:
                kommoResult
            });

          }


          const contacts =
            searchData &&
            searchData._embedded &&
            Array.isArray(
              searchData._embedded.contacts
            )
              ? searchData
                  ._embedded
                  .contacts
              : [];


          const oldUsernameLower =
            oldUsername
              .trim()
              .toLowerCase();


          /*
           * -------------------------------------------------
           * SOLO COINCIDENCIA EXACTA
           * -------------------------------------------------
           */

          const exactContact =
            contacts.find(
              contact =>
                String(
                  contact.name ||
                  ""
                )
                  .trim()
                  .toLowerCase() ===
                oldUsernameLower
            );


          if (
            !exactContact
          ) {

            kommoResult.error =
              `No se encontró en Kommo un contacto cuyo nombre sea exactamente "${oldUsername}".`;


            console.warn(
              "Kommo:",
              kommoResult.error
            );


            return res.status(404).json({
              ok: false,
              error:
                "No se encontró el contacto correspondiente en Kommo.",
              kommo:
                kommoResult
            });

          }


          const contactId =
            Number(
              exactContact.id
            );


          if (
            !Number.isFinite(
              contactId
            )
          ) {

            kommoResult.error =
              "El contacto encontrado en Kommo no tiene un ID válido.";


            return res.status(502).json({
              ok: false,
              error:
                "El contacto encontrado en Kommo no tiene un ID válido.",
              kommo:
                kommoResult
            });

          }


          kommoResult.contact_id =
            contactId;


          /*
           * -------------------------------------------------
           * ACTUALIZAR NOMBRE DEL CONTACTO
           * -------------------------------------------------
           */

          const updateResponse =
            await fetch(

              `${kommoBaseUrl}/contacts/${contactId}`,

              {
                method:
                  "PATCH",

                headers: {

                  ...authHeaders,

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


            return res.status(502).json({
              ok: false,
              error:
                "Kommo encontró el contacto pero rechazó el cambio de nombre.",
              kommo:
                kommoResult
            });

          }


          /*
           * -------------------------------------------------
           * VERIFICAR CAMBIO EN KOMMO
           * -------------------------------------------------
           */

          const verifyResponse =
            await fetch(

              `${kommoBaseUrl}/contacts/${contactId}`,

              {
                method:
                  "GET",

                headers:
                  authHeaders
              }

            );


          const verifyText =
            await verifyResponse.text();


          if (
            !verifyResponse.ok
          ) {

            console.error(
              "Kommo VERIFY:",
              verifyResponse.status,
              verifyText
            );


            kommoResult.error =
              `El nombre fue enviado a Kommo, pero no se pudo verificar (${verifyResponse.status}).`;


            return res.status(502).json({
              ok: false,
              error:
                "No se pudo verificar el cambio de nombre en Kommo.",
              kommo:
                kommoResult
            });

          }


          let verifyData =
            null;


          try {

            verifyData =
              verifyText
                ? JSON.parse(
                    verifyText
                  )
                : null;

          } catch (_) {}


          const verifiedName =
            String(
              verifyData?.name ||
              ""
            ).trim();


          if (
            verifiedName
              .toLowerCase() !==
            cleanUsername
              .toLowerCase()
          ) {

            kommoResult.error =
              `Kommo no devolvió el nombre esperado. Recibido: "${verifiedName}".`;


            return res.status(502).json({
              ok: false,
              error:
                "El cambio no quedó confirmado en Kommo.",
              kommo:
                kommoResult
            });

          }


          kommoResult.updated =
            true;


          console.log(
            "✅ KOMMO SINCRONIZADO:",
            contactId,
            oldUsername,
            "→",
            cleanUsername
          );


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


          return res.status(502).json({
            ok: false,
            error:
              "No se pudo sincronizar el nombre con Kommo.",
            kommo:
              kommoResult
          });

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
