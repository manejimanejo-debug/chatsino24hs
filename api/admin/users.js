import {
  isAdminAuthenticated
} from "../_lib/admin-auth.js";

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized"
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

      Accept:
        "application/json"
    };

    /*
     * Obtenemos los clientes registrados.
     */

    const customersResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/customers?select=id,phone,client_id,created_at,updated_at,push_active&order=created_at.desc&limit=5000`,
        {
          method: "GET",
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
     * Obtenemos las suscripciones Push.
     */

    const subscriptionsResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions?select=id,client_id,endpoint,updated_at`,
        {
          method: "GET",
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
     * Todos los client_id que actualmente
     * tienen una suscripción Push.
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
     * Unimos customers + Push.
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
            ) ||
            customer.push_active === true;

          return {

            id:
              customer.id,

            phone:
              customer.phone,

            client_id:
              customer.client_id,

            created_at:
              customer.created_at,

            updated_at:
              customer.updated_at,

            push_active:
              pushActive,

            push_status:
              pushActive
                ? "active"
                : "inactive"

          };

        }
      );


    const active =
      users.filter(
        user =>
          user.push_active === true
      ).length;


    const inactive =
      users.length -
      active;


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
        "Internal server error"

    });

  }

}