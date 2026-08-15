export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    try {

      // =====================================================
      // AUTH - LOGIN
      // =====================================================

      if (
        pathname === "/api/auth/login" &&
        method === "POST"
      ) {
        const body = await request.json();

        const password =
          String(body.password || "");

        if (
          !password ||
          password !== env.ADMIN_PASSWORD
        ) {
          return json(
            { error: "Invalid password" },
            401
          );
        }

        const response = json({
          success: true
        });

        response.headers.append(
          "Set-Cookie",
          createSessionCookie(
            env.ADMIN_SESSION_TOKEN
          )
        );

        return response;
      }


      // =====================================================
      // AUTH - LOGOUT
      // =====================================================

      if (
        pathname === "/api/auth/logout" &&
        method === "POST"
      ) {
        const response = json({
          success: true
        });

        response.headers.append(
          "Set-Cookie",
          clearSessionCookie()
        );

        return response;
      }


      // =====================================================
      // ADMIN PAGE
      // =====================================================

      if (pathname === "/admin") {
        if (
          !isAdminAuthenticated(
            request,
            env
          )
        ) {
          return Response.redirect(
            new URL("/login", request.url),
            302
          );
        }

        return env.ASSETS.fetch(request);
      }


      // =====================================================
      // PROTECT ADMIN API ROUTES
      // =====================================================

      if (
        pathname.startsWith(
          "/api/admin/"
        )
      ) {
        if (
          !isAdminAuthenticated(
            request,
            env
          )
        ) {
          return json(
            { error: "Unauthorized" },
            401
          );
        }
      }


      // =====================================================
      // PUBLIC EVENTS
      // =====================================================

      if (
        pathname === "/api/events" &&
        method === "GET"
      ) {
        const { results } =
          await env.DB
            .prepare(`
              SELECT
                id,
                event_date,
                venue,
                location,
                location_url,
                start_time,
                end_time,
                note,
                event_type,
                public_url,
                created_at
              FROM events
              WHERE event_date >= date('now')
              ORDER BY event_date ASC, start_time ASC
            `)
            .all();

        return json(results);
      }


      // =====================================================
      // PUBLIC - CONTACT FORM
      // =====================================================

      if (
        pathname === "/api/contact" &&
        method === "POST"
      ) {
        const body =
          await request.json();

        const name =
          String(
            body.name || ""
          ).trim();

        const email =
          String(
            body.email || ""
          ).trim();

        const message =
          String(
            body.message || ""
          ).trim();

        const contactIntent =
          normalizeContactIntent(
            body.contact_intent
          );

        const bookingType =
          normalizeBookingType(
            body.booking_type
          );

        const eventDate =
          cleanOptional(
            body.event_date
          );


        // REQUIRED FIELDS

        if (
          !name ||
          !email ||
          !message
        ) {
          return json(
            {
              error:
                "Missing required fields"
            },
            400
          );
        }


        // EMAIL

        if (!isValidEmail(email)) {
          return json(
            {
              error:
                "Invalid email address"
            },
            400
          );
        }


        // LENGTH LIMITS

        if (name.length > 150) {
          return json(
            {
              error:
                "Name is too long"
            },
            400
          );
        }

        if (email.length > 254) {
          return json(
            {
              error:
                "Email is too long"
            },
            400
          );
        }

        if (message.length > 10000) {
          return json(
            {
              error:
                "Message is too long"
            },
            400
          );
        }


        // OPTIONAL EVENT DATE

        if (
          eventDate &&
          !isValidDate(eventDate)
        ) {
          return json(
            {
              error:
                "Invalid event date"
            },
            400
          );
        }


        const result =
          await env.DB
            .prepare(`
              INSERT INTO contact_messages
              (
                name,
                email,
                subject,
                message,
                contact_intent,
                booking_type,
                event_date,
                status
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, 'UNREAD')
            `)
            .bind(
              name,
              email,
              "",
              message,
              contactIntent,
              bookingType,
              eventDate
            )
            .run();


        return json(
          {
            success: true,
            id:
              result.meta
                ?.last_row_id ||
              null
          },
          201
        );
      }


      // =====================================================
      // ADMIN - MESSAGES LIST
      // =====================================================

      if (
        pathname ===
          "/api/admin/messages" &&
        method === "GET"
      ) {
        const { results } =
          await env.DB
            .prepare(`
              SELECT
                id,
                name,
                email,
                subject,
                message,
                contact_intent,
                booking_type,
                event_date,
                status,
                created_at,
                read_at,
                archived_at
              FROM contact_messages
              ORDER BY
                CASE
                  WHEN status = 'UNREAD'
                  THEN 0
                  WHEN status = 'READ'
                  THEN 1
                  ELSE 2
                END,
                created_at DESC,
                id DESC
            `)
            .all();

        return json(results);
      }


      // =====================================================
      // ADMIN - UNREAD MESSAGE COUNT
      // =====================================================

      if (
        pathname ===
          "/api/admin/messages/unread-count" &&
        method === "GET"
      ) {
        const result =
          await env.DB
            .prepare(`
              SELECT
                COUNT(*) AS count
              FROM contact_messages
              WHERE status = 'UNREAD'
            `)
            .first();

        return json({
          count:
            Number(
              result?.count || 0
            )
        });
      }


      // =====================================================
      // ADMIN - MESSAGE BY ID
      // =====================================================

      const adminMessageMatch =
        pathname.match(
          /^\/api\/admin\/messages\/(\d+)$/
        );


      if (adminMessageMatch) {

        const id =
          Number(
            adminMessageMatch[1]
          );


        if (
          !Number.isInteger(id) ||
          id <= 0
        ) {
          return json(
            {
              error:
                "Invalid message ID"
            },
            400
          );
        }


        // -------------------------------------------------
        // GET MESSAGE
        // -------------------------------------------------

        if (method === "GET") {

          const message =
            await env.DB
              .prepare(`
                SELECT
                  id,
                  name,
                  email,
                  subject,
                  message,
                  contact_intent,
                  booking_type,
                  event_date,
                  status,
                  created_at,
                  read_at,
                  archived_at
                FROM contact_messages
                WHERE id = ?
              `)
              .bind(id)
              .first();


          if (!message) {
            return json(
              {
                error:
                  "Message not found"
              },
              404
            );
          }


          return json(message);
        }


        // -------------------------------------------------
        // UPDATE MESSAGE STATUS
        // -------------------------------------------------

        if (method === "PATCH") {

          const body =
            await request.json();

          const status =
            normalizeMessageStatus(
              body.status
            );


          if (!status) {
            return json(
              {
                error:
                  "Invalid message status"
              },
              400
            );
          }


          const existing =
            await env.DB
              .prepare(`
                SELECT id
                FROM contact_messages
                WHERE id = ?
              `)
              .bind(id)
              .first();


          if (!existing) {
            return json(
              {
                error:
                  "Message not found"
              },
              404
            );
          }


          if (status === "UNREAD") {

            await env.DB
              .prepare(`
                UPDATE contact_messages
                SET
                  status = 'UNREAD',
                  read_at = NULL,
                  archived_at = NULL
                WHERE id = ?
              `)
              .bind(id)
              .run();

          } else if (
            status === "READ"
          ) {

            await env.DB
              .prepare(`
                UPDATE contact_messages
                SET
                  status = 'READ',
                  read_at =
                    COALESCE(
                      read_at,
                      CURRENT_TIMESTAMP
                    ),
                  archived_at = NULL
                WHERE id = ?
              `)
              .bind(id)
              .run();

          } else if (
            status === "ARCHIVED"
          ) {

            await env.DB
              .prepare(`
                UPDATE contact_messages
                SET
                  status = 'ARCHIVED',
                  read_at =
                    COALESCE(
                      read_at,
                      CURRENT_TIMESTAMP
                    ),
                  archived_at =
                    CURRENT_TIMESTAMP
                WHERE id = ?
              `)
              .bind(id)
              .run();
          }


          return json({
            success: true,
            status
          });
        }


        // -------------------------------------------------
        // DELETE MESSAGE
        // -------------------------------------------------

        if (method === "DELETE") {

          const existing =
            await env.DB
              .prepare(`
                SELECT id
                FROM contact_messages
                WHERE id = ?
              `)
              .bind(id)
              .first();


          if (!existing) {
            return json(
              {
                error:
                  "Message not found"
              },
              404
            );
          }


          await env.DB
            .prepare(`
              DELETE FROM contact_messages
              WHERE id = ?
            `)
            .bind(id)
            .run();


          return json({
            success: true
          });
        }
      }


      // =====================================================
      // ADMIN - GET ALL EVENTS
      // =====================================================

      if (
        pathname === "/api/admin/events" &&
        method === "GET"
      ) {
        const { results } =
          await env.DB
            .prepare(`
              SELECT
                id,
                event_date,
                venue,
                location,
                location_url,
                start_time,
                end_time,
                note,
                event_type,
                public_url,
                created_at
              FROM events
              ORDER BY event_date ASC, start_time ASC
            `)
            .all();

        return json(results);
      }


      // =====================================================
      // ADMIN - CREATE EVENT
      // =====================================================

      if (
        pathname === "/api/admin/events" &&
        method === "POST"
      ) {
        const body =
          await request.json();

        const validation =
          validateEvent(body);

        if (!validation.ok) {
          return json(
            {
              error:
                validation.error
            },
            400
          );
        }


        const result =
          await env.DB
            .prepare(`
              INSERT INTO events
              (
                event_date,
                venue,
                location,
                location_url,
                start_time,
                end_time,
                note,
                event_type,
                public_url
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(
              validation.data.event_date,
              validation.data.venue,
              validation.data.location,
              validation.data.location_url,
              validation.data.start_time,
              validation.data.end_time,
              validation.data.note,
              validation.data.event_type,
              validation.data.public_url
            )
            .run();


        return json(
          {
            success: true,
            id:
              result.meta
                ?.last_row_id
          },
          201
        );
      }


      // =====================================================
      // ADMIN - EVENT BY ID
      // =====================================================

      const adminEventMatch =
        pathname.match(
          /^\/api\/admin\/events\/(\d+)$/
        );


      if (adminEventMatch) {

        const id =
          Number(
            adminEventMatch[1]
          );


        if (
          !Number.isInteger(id) ||
          id <= 0
        ) {
          return json(
            {
              error:
                "Invalid event ID"
            },
            400
          );
        }


        // -------------------------------------------------
        // UPDATE EVENT
        // -------------------------------------------------

        if (method === "PUT") {

          const body =
            await request.json();

          const validation =
            validateEvent(body);


          if (!validation.ok) {
            return json(
              {
                error:
                  validation.error
              },
              400
            );
          }


          const existing =
            await env.DB
              .prepare(`
                SELECT id
                FROM events
                WHERE id = ?
              `)
              .bind(id)
              .first();


          if (!existing) {
            return json(
              {
                error:
                  "Event not found"
              },
              404
            );
          }


          await env.DB
            .prepare(`
              UPDATE events
              SET
                event_date = ?,
                venue = ?,
                location = ?,
                location_url = ?,
                start_time = ?,
                end_time = ?,
                note = ?,
                event_type = ?,
                public_url = ?
              WHERE id = ?
            `)
            .bind(
              validation.data.event_date,
              validation.data.venue,
              validation.data.location,
              validation.data.location_url,
              validation.data.start_time,
              validation.data.end_time,
              validation.data.note,
              validation.data.event_type,
              validation.data.public_url,
              id
            )
            .run();


          return json({
            success: true
          });
        }


        // -------------------------------------------------
        // DELETE EVENT
        // -------------------------------------------------

        if (method === "DELETE") {

          const existing =
            await env.DB
              .prepare(`
                SELECT id
                FROM events
                WHERE id = ?
              `)
              .bind(id)
              .first();


          if (!existing) {
            return json(
              {
                error:
                  "Event not found"
              },
              404
            );
          }


          await env.DB
            .prepare(`
              DELETE FROM events
              WHERE id = ?
            `)
            .bind(id)
            .run();


          return json({
            success: true
          });
        }
      }


      // =====================================================
      // STATIC WEBSITE
      // =====================================================

      return env.ASSETS.fetch(
        request
      );


    } catch (error) {

      console.error(
        "Worker error:",
        error
      );

      return json(
        {
          error:
            "Internal server error"
        },
        500
      );
    }
  }
};


// =========================================================
// AUTH
// =========================================================

function isAdminAuthenticated(
  request,
  env
) {
  if (!env.ADMIN_SESSION_TOKEN) {
    return false;
  }

  const cookies =
    parseCookies(
      request.headers.get(
        "Cookie"
      ) || ""
    );

  return (
    cookies.orange_may_admin ===
    env.ADMIN_SESSION_TOKEN
  );
}


function createSessionCookie(token) {
  return [
    `orange_may_admin=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=28800"
  ].join("; ");
}


function clearSessionCookie() {
  return [
    "orange_may_admin=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0"
  ].join("; ");
}


function parseCookies(
  cookieHeader
) {
  const cookies = {};

  cookieHeader
    .split(";")
    .forEach(cookie => {

      const separator =
        cookie.indexOf("=");

      if (separator === -1) {
        return;
      }

      const key =
        cookie
          .slice(0, separator)
          .trim();

      const value =
        cookie
          .slice(separator + 1)
          .trim();

      cookies[key] = value;
    });

  return cookies;
}


// =========================================================
// EVENT VALIDATION
// =========================================================

function validateEvent(body) {

  const event_date =
    String(
      body.event_date || ""
    ).trim();

  const venue =
    String(
      body.venue || ""
    ).trim();

  const location =
    String(
      body.location || ""
    ).trim();

  const location_url =
    cleanOptional(
      body.location_url
    );

  const start_time =
    cleanOptional(
      body.start_time
    );

  const end_time =
    cleanOptional(
      body.end_time
    );

  const note =
    cleanOptional(
      body.note
    );

  const event_type =
    normalizeEventType(
      body.event_type
    );

  const public_url =
    cleanOptional(
      body.public_url
    );


  if (!event_date) {
    return {
      ok: false,
      error:
        "Date is required"
    };
  }


  if (!venue) {
    return {
      ok: false,
      error:
        "Venue is required"
    };
  }


  if (!location) {
    return {
      ok: false,
      error:
        "Location is required"
    };
  }


  if (!isValidDate(event_date)) {
    return {
      ok: false,
      error:
        "Invalid date"
    };
  }


  if (
    start_time &&
    !/^\d{2}:\d{2}$/
      .test(start_time)
  ) {
    return {
      ok: false,
      error:
        "Invalid start time"
    };
  }


  if (
    end_time &&
    !/^\d{2}:\d{2}$/
      .test(end_time)
  ) {
    return {
      ok: false,
      error:
        "Invalid end time"
    };
  }


  if (
    start_time &&
    end_time &&
    end_time < start_time
  ) {
    return {
      ok: false,
      error:
        "End time cannot be earlier than start time"
    };
  }


  if (
    location_url &&
    !isValidHttpUrl(
      location_url
    )
  ) {
    return {
      ok: false,
      error:
        "Invalid location URL"
    };
  }


  if (
    public_url &&
    !isValidHttpUrl(
      public_url
    )
  ) {
    return {
      ok: false,
      error:
        "Invalid public URL"
    };
  }


  return {
    ok: true,

    data: {
      event_date,
      venue,
      location,
      location_url,
      start_time,
      end_time,
      note,
      event_type,
      public_url
    }
  };
}


// =========================================================
// EVENT TYPE
// =========================================================

function normalizeEventType(value) {

  const allowedTypes = [
    "PUBLIC",
    "GUESTS_ONLY",
    "PRIVATE"
  ];

  const type =
    String(
      value || "PUBLIC"
    )
      .trim()
      .toUpperCase();

  return allowedTypes.includes(type)
    ? type
    : "PUBLIC";
}


// =========================================================
// CONTACT
// =========================================================

function normalizeContactIntent(
  value
) {

  if (!value) {
    return null;
  }

  const allowed = [
    "BOOKING",
    "INFO",
    "COLLABORATION",
    "HELLO"
  ];

  const normalized =
    String(value)
      .trim()
      .toUpperCase();

  return allowed.includes(
    normalized
  )
    ? normalized
    : null;
}


function normalizeBookingType(
  value
) {

  if (!value) {
    return null;
  }

  const allowed = [
    "HOTEL",
    "VENUE",
    "WEDDING",
    "PRIVATE_EVENT",
    "OTHER"
  ];

  const normalized =
    String(value)
      .trim()
      .toUpperCase();

  return allowed.includes(
    normalized
  )
    ? normalized
    : null;
}


function normalizeMessageStatus(
  value
) {

  const allowed = [
    "UNREAD",
    "READ",
    "ARCHIVED"
  ];

  const normalized =
    String(
      value || ""
    )
      .trim()
      .toUpperCase();

  return allowed.includes(
    normalized
  )
    ? normalized
    : null;
}


// =========================================================
// EMAIL VALIDATION
// =========================================================

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(value);
}


// =========================================================
// DATE VALIDATION
// =========================================================

function isValidDate(value) {

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(value)
  ) {
    return false;
  }

  const date =
    new Date(
      `${value}T00:00:00`
    );

  return !Number.isNaN(
    date.getTime()
  );
}


// =========================================================
// URL VALIDATION
// =========================================================

function isValidHttpUrl(value) {

  try {

    const url =
      new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );

  } catch {

    return false;
  }
}


// =========================================================
// HELPERS
// =========================================================

function cleanOptional(value) {

  const result =
    String(
      value || ""
    ).trim();

  return result || null;
}


function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}
