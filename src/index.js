/* ============================================================
   ORANGE MAY WEBSITE
   Cloudflare Worker Backend

   Gestisce:
   - sito statico
   - login admin
   - eventi
   - eliminazione automatica eventi passati
   - venue salvate
   - form contatti
   - messaggi admin
============================================================ */


export default {

  async fetch(request, env) {

    try {

      return await handleRequest(
        request,
        env
      );

    } catch (error) {

      console.error(
        "Worker error:",
        error
      );


      if (
        error instanceof HttpError
      ) {

        return jsonResponse(
          {
            error:
              error.message
          },
          error.status
        );

      }


      return jsonResponse(
        {
          error:
            "Internal server error"
        },
        500
      );

    }

  }

};


/* ============================================================
   MAIN ROUTER
============================================================ */

async function handleRequest(
  request,
  env
) {

  const url =
    new URL(request.url);

  const path =
    normalizePath(
      url.pathname
    );

  const method =
    request.method.toUpperCase();


  /* ==========================================================
     OPTIONS
  ========================================================== */

  if (method === "OPTIONS") {

    return new Response(
      null,
      {
        status: 204
      }
    );

  }


  /* ==========================================================
     PUBLIC API
  ========================================================== */

  if (
    path === "/api/events" &&
    method === "GET"
  ) {

    return getPublicEvents(
      env
    );

  }


  if (
    path === "/api/contact" &&
    method === "POST"
  ) {

    return createContactMessage(
      request,
      env
    );

  }


  /* ==========================================================
     AUTH
  ========================================================== */

  if (
    path === "/api/auth/login" &&
    method === "POST"
  ) {

    return loginAdmin(
      request,
      env
    );

  }


  if (
    path === "/api/auth/logout" &&
    method === "POST"
  ) {

    return logoutAdmin();

  }


  if (
    path === "/api/auth/check" &&
    method === "GET"
  ) {

    const authenticated =
      await isAuthenticated(
        request,
        env
      );

    return jsonResponse({
      authenticated
    });

  }


  /* ==========================================================
     ADMIN PAGE
  ========================================================== */

  if (
    path === "/admin" ||
    path === "/admin/"
  ) {

    const authenticated =
      await isAuthenticated(
        request,
        env
      );


    if (!authenticated) {

      return redirectResponse(
        "/login"
      );

    }


    return serveAsset(
      request,
      env,
      "/admin.html"
    );

  }


  /* ==========================================================
     LOGIN PAGE
  ========================================================== */

  if (
    path === "/login" ||
    path === "/login/"
  ) {

    const authenticated =
      await isAuthenticated(
        request,
        env
      );


    if (authenticated) {

      return redirectResponse(
        "/admin"
      );

    }


    return serveAsset(
      request,
      env,
      "/login.html"
    );

  }


  /* ==========================================================
     ADMIN API AUTH CHECK
  ========================================================== */

  if (
    path.startsWith(
      "/api/admin/"
    )
  ) {

    const authenticated =
      await isAuthenticated(
        request,
        env
      );


    if (!authenticated) {

      return jsonResponse(
        {
          error:
            "Unauthorized"
        },
        401
      );

    }

  }


  /* ==========================================================
     ADMIN EVENTS
  ========================================================== */

  if (
    path === "/api/admin/events" &&
    method === "GET"
  ) {

    return getAdminEvents(
      env
    );

  }


  if (
    path === "/api/admin/events" &&
    method === "POST"
  ) {

    return createEvent(
      request,
      env
    );

  }


  const eventMatch =
    path.match(
      /^\/api\/admin\/events\/(\d+)$/
    );


  if (eventMatch) {

    const id =
      Number(
        eventMatch[1]
      );


    if (method === "GET") {

      return getEvent(
        id,
        env
      );

    }


    if (
      method === "PUT" ||
      method === "PATCH"
    ) {

      return updateEvent(
        id,
        request,
        env
      );

    }


    if (method === "DELETE") {

      return deleteEvent(
        id,
        env
      );

    }

  }


  /* ==========================================================
     ADMIN VENUES
  ========================================================== */

  if (
    path === "/api/admin/venues" &&
    method === "GET"
  ) {

    return getVenues(
      env
    );

  }


  if (
    path === "/api/admin/venues" &&
    method === "POST"
  ) {

    return createVenue(
      request,
      env
    );

  }


  const venueMatch =
    path.match(
      /^\/api\/admin\/venues\/(\d+)$/
    );


  if (venueMatch) {

    const id =
      Number(
        venueMatch[1]
      );


    if (method === "GET") {

      return getVenue(
        id,
        env
      );

    }


    if (
      method === "PUT" ||
      method === "PATCH"
    ) {

      return updateVenue(
        id,
        request,
        env
      );

    }


    if (method === "DELETE") {

      return deleteVenue(
        id,
        env
      );

    }

  }


  /* ==========================================================
     ADMIN MESSAGES
  ========================================================== */

  if (
    path ===
      "/api/admin/messages/unread-count" &&
    method === "GET"
  ) {

    return getUnreadMessageCount(
      env
    );

  }


  if (
    path === "/api/admin/messages" &&
    method === "GET"
  ) {

    return getMessages(
      env
    );

  }


  const messageMatch =
    path.match(
      /^\/api\/admin\/messages\/(\d+)$/
    );


  if (messageMatch) {

    const id =
      Number(
        messageMatch[1]
      );


    if (method === "GET") {

      return getMessage(
        id,
        env
      );

    }


    if (method === "PATCH") {

      return updateMessage(
        id,
        request,
        env
      );

    }


    if (method === "DELETE") {

      return deleteMessage(
        id,
        env
      );

    }

  }


  /* ==========================================================
     STATIC WEBSITE
  ========================================================== */

  if (env.ASSETS) {

    return env.ASSETS.fetch(
      request
    );

  }


  return new Response(
    "Not found",
    {
      status: 404
    }
  );

}


/* ============================================================
   AUTOMATIC EVENT CLEANUP
============================================================ */

/*
   Restituisce la data corrente in Italia nel formato:

   YYYY-MM-DD

   Usiamo esplicitamente Europe/Rome così la cancellazione
   segue il giorno italiano e non l'orario UTC di Cloudflare.
*/

function getTodayRome() {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Rome",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    )
      .formatToParts(
        new Date()
      );


  const values = {};


  for (
    const part of parts
  ) {

    if (
      part.type !==
      "literal"
    ) {

      values[
        part.type
      ] =
        part.value;

    }

  }


  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );

}


/*
   Elimina definitivamente dal database
   tutte le date precedenti a oggi.

   Esempio:
   oggi 16 agosto
   → 15 agosto e precedenti eliminati
   → 16 agosto resta
*/

async function cleanupPastEvents(
  env
) {

  const today =
    getTodayRome();


  try {

    const result =
      await env.DB
        .prepare(`
          DELETE FROM events
          WHERE event_date < ?
        `)
        .bind(
          today
        )
        .run();


    const deleted =
      Number(
        result?.meta?.changes ||
        0
      );


    if (deleted > 0) {

      console.log(
        `Deleted ${deleted} past event(s).`
      );

    }

  } catch (error) {

    /*
       Non blocchiamo il sito se per qualche
       motivo la pulizia dovesse fallire.
    */

    console.error(
      "Past events cleanup error:",
      error
    );

  }

}


/* ============================================================
   PUBLIC EVENTS
============================================================ */

async function getPublicEvents(
  env
) {

  /*
    Prima di restituire le date,
    puliamo automaticamente quelle vecchie.
  */

  await cleanupPastEvents(
    env
  );


  const result =
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

        ORDER BY
          event_date ASC,

          CASE
            WHEN start_time IS NULL
            OR start_time = ''
            THEN '23:59'
            ELSE start_time
          END ASC,

          id ASC
      `)
      .all();


  return jsonResponse(
    result.results || []
  );

}


/* ============================================================
   ADMIN EVENTS
============================================================ */

async function getAdminEvents(
  env
) {

  /*
    Anche aprendo il pannello admin
    vengono eliminate le date passate.
  */

  await cleanupPastEvents(
    env
  );


  const result =
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

        ORDER BY
          event_date ASC,

          CASE
            WHEN start_time IS NULL
            OR start_time = ''
            THEN '23:59'
            ELSE start_time
          END ASC,

          id ASC
      `)
      .all();


  return jsonResponse(
    result.results || []
  );

}


async function getEvent(
  id,
  env
) {

  const event =
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

        WHERE id = ?

        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!event) {

    return jsonResponse(
      {
        error:
          "Event not found"
      },
      404
    );

  }


  return jsonResponse(
    event
  );

}


async function createEvent(
  request,
  env
) {

  const body =
    await readJsonBody(
      request
    );


  const validation =
    validateEvent(
      body
    );


  if (!validation.valid) {

    return jsonResponse(
      {
        error:
          validation.error
      },
      400
    );

  }


  const data =
    validation.data;


  const result =
    await env.DB
      .prepare(`
        INSERT INTO events (
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

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `)
      .bind(
        data.event_date,
        data.venue,
        data.location,
        data.location_url,
        data.start_time,
        data.end_time,
        data.note,
        data.event_type,
        data.public_url
      )
      .run();


  return jsonResponse(
    {
      success: true,

      id:
        result.meta
          ?.last_row_id
    },
    201
  );

}


async function updateEvent(
  id,
  request,
  env
) {

  const existing =
    await env.DB
      .prepare(`
        SELECT id
        FROM events
        WHERE id = ?
        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!existing) {

    return jsonResponse(
      {
        error:
          "Event not found"
      },
      404
    );

  }


  const body =
    await readJsonBody(
      request
    );


  const validation =
    validateEvent(
      body
    );


  if (!validation.valid) {

    return jsonResponse(
      {
        error:
          validation.error
      },
      400
    );

  }


  const data =
    validation.data;


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
      data.event_date,
      data.venue,
      data.location,
      data.location_url,
      data.start_time,
      data.end_time,
      data.note,
      data.event_type,
      data.public_url,
      id
    )
    .run();


  return jsonResponse({
    success: true
  });

}


async function deleteEvent(
  id,
  env
) {

  const existing =
    await env.DB
      .prepare(`
        SELECT id
        FROM events
        WHERE id = ?
        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!existing) {

    return jsonResponse(
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


  return jsonResponse({
    success: true
  });

}


/* ============================================================
   EVENT VALIDATION
============================================================ */

function validateEvent(
  body
) {

  const eventDate =
    cleanString(
      body.event_date,
      20
    );


  const venue =
    cleanString(
      body.venue,
      250
    );


  const location =
    cleanString(
      body.location,
      300
    );


  const locationUrl =
    cleanOptionalString(
      body.location_url,
      1500
    );


  const startTime =
    cleanOptionalString(
      body.start_time,
      10
    );


  const endTime =
    cleanOptionalString(
      body.end_time,
      10
    );


  const note =
    cleanOptionalString(
      body.note,
      2000
    );


  const eventType =
    cleanString(
      body.event_type ||
      "PUBLIC",
      30
    )
      .toUpperCase();


  const publicUrl =
    cleanOptionalString(
      body.public_url,
      1500
    );


  if (!eventDate) {

    return {
      valid: false,
      error:
        "La data è obbligatoria."
    };

  }


  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(eventDate)
  ) {

    return {
      valid: false,
      error:
        "Formato data non valido."
    };

  }


  /*
    Non permettiamo di creare una nuova data
    che è già precedente a oggi.
  */

  const today =
    getTodayRome();


  if (
    eventDate < today
  ) {

    return {
      valid: false,
      error:
        "Non puoi inserire una data già passata."
    };

  }


  if (!venue) {

    return {
      valid: false,
      error:
        "La venue è obbligatoria."
    };

  }


  if (!location) {

    return {
      valid: false,
      error:
        "Il luogo è obbligatorio."
    };

  }


  if (
    startTime &&
    !isValidTime(
      startTime
    )
  ) {

    return {
      valid: false,
      error:
        "Ora di inizio non valida."
    };

  }


  if (
    endTime &&
    !isValidTime(
      endTime
    )
  ) {

    return {
      valid: false,
      error:
        "Ora di fine non valida."
    };

  }


  const allowedTypes = [
    "PUBLIC",
    "GUESTS_ONLY",
    "PRIVATE"
  ];


  if (
    !allowedTypes.includes(
      eventType
    )
  ) {

    return {
      valid: false,
      error:
        "Tipo di evento non valido."
    };

  }


  if (
    locationUrl &&
    !isValidHttpUrl(
      locationUrl
    )
  ) {

    return {
      valid: false,
      error:
        "Il link indicazioni non è valido."
    };

  }


  if (
    publicUrl &&
    !isValidHttpUrl(
      publicUrl
    )
  ) {

    return {
      valid: false,
      error:
        "Il link pubblico non è valido."
    };

  }


  return {

    valid: true,

    data: {

      event_date:
        eventDate,

      venue,

      location,

      location_url:
        locationUrl,

      start_time:
        startTime,

      end_time:
        endTime,

      note,

      event_type:
        eventType,

      public_url:
        publicUrl

    }

  };

}


/* ============================================================
   VENUES
============================================================ */

async function getVenues(
  env
) {

  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          name,
          location,
          location_url,
          created_at,
          updated_at

        FROM venues

        ORDER BY
          name COLLATE NOCASE ASC,
          id ASC
      `)
      .all();


  return jsonResponse(
    result.results || []
  );

}


async function getVenue(
  id,
  env
) {

  const venue =
    await env.DB
      .prepare(`
        SELECT
          id,
          name,
          location,
          location_url,
          created_at,
          updated_at

        FROM venues

        WHERE id = ?

        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!venue) {

    return jsonResponse(
      {
        error:
          "Venue not found"
      },
      404
    );

  }


  return jsonResponse(
    venue
  );

}


async function createVenue(
  request,
  env
) {

  const body =
    await readJsonBody(
      request
    );


  const validation =
    validateVenue(
      body
    );


  if (!validation.valid) {

    return jsonResponse(
      {
        error:
          validation.error
      },
      400
    );

  }


  const data =
    validation.data;


  const duplicate =
    await env.DB
      .prepare(`
        SELECT id

        FROM venues

        WHERE
          lower(trim(name)) =
          lower(trim(?))

        AND
          lower(trim(location)) =
          lower(trim(?))

        LIMIT 1
      `)
      .bind(
        data.name,
        data.location
      )
      .first();


  if (duplicate) {

    return jsonResponse(
      {
        error:
          "Questa venue è già salvata."
      },
      409
    );

  }


  const result =
    await env.DB
      .prepare(`
        INSERT INTO venues (
          name,
          location,
          location_url
        )

        VALUES (
          ?,
          ?,
          ?
        )
      `)
      .bind(
        data.name,
        data.location,
        data.location_url
      )
      .run();


  return jsonResponse(
    {
      success: true,

      id:
        result.meta
          ?.last_row_id
    },
    201
  );

}


async function updateVenue(
  id,
  request,
  env
) {

  const existing =
    await env.DB
      .prepare(`
        SELECT id
        FROM venues
        WHERE id = ?
        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!existing) {

    return jsonResponse(
      {
        error:
          "Venue not found"
      },
      404
    );

  }


  const body =
    await readJsonBody(
      request
    );


  const validation =
    validateVenue(
      body
    );


  if (!validation.valid) {

    return jsonResponse(
      {
        error:
          validation.error
      },
      400
    );

  }


  const data =
    validation.data;


  const duplicate =
    await env.DB
      .prepare(`
        SELECT id

        FROM venues

        WHERE id != ?

        AND
          lower(trim(name)) =
          lower(trim(?))

        AND
          lower(trim(location)) =
          lower(trim(?))

        LIMIT 1
      `)
      .bind(
        id,
        data.name,
        data.location
      )
      .first();


  if (duplicate) {

    return jsonResponse(
      {
        error:
          "Esiste già una venue con questo nome e luogo."
      },
      409
    );

  }


  await env.DB
    .prepare(`
      UPDATE venues

      SET
        name = ?,
        location = ?,
        location_url = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
    `)
    .bind(
      data.name,
      data.location,
      data.location_url,
      id
    )
    .run();


  return jsonResponse({
    success: true
  });

}


async function deleteVenue(
  id,
  env
) {

  const existing =
    await env.DB
      .prepare(`
        SELECT
          id,
          name

        FROM venues

        WHERE id = ?

        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!existing) {

    return jsonResponse(
      {
        error:
          "Venue not found"
      },
      404
    );

  }


  /*
    Eliminare una venue salvata NON modifica
    gli eventi già esistenti.
  */

  await env.DB
    .prepare(`
      DELETE FROM venues
      WHERE id = ?
    `)
    .bind(id)
    .run();


  return jsonResponse({
    success: true
  });

}


function validateVenue(
  body
) {

  const name =
    cleanString(
      body.name,
      250
    );


  const location =
    cleanString(
      body.location,
      300
    );


  const locationUrl =
    cleanOptionalString(
      body.location_url,
      1500
    );


  if (!name) {

    return {
      valid: false,
      error:
        "Il nome della venue è obbligatorio."
    };

  }


  if (!location) {

    return {
      valid: false,
      error:
        "Il luogo è obbligatorio."
    };

  }


  if (
    locationUrl &&
    !isValidHttpUrl(
      locationUrl
    )
  ) {

    return {
      valid: false,
      error:
        "Il link della posizione non è valido."
    };

  }


  return {

    valid: true,

    data: {

      name,

      location,

      location_url:
        locationUrl

    }

  };

}


/* ============================================================
   PUBLIC CONTACT FORM
============================================================ */

async function createContactMessage(
  request,
  env
) {

  const body =
    await readJsonBody(
      request
    );


  const name =
    cleanString(
      body.name,
      120
    );


  const email =
    cleanString(
      body.email,
      180
    )
      .toLowerCase();


  const message =
    cleanString(
      body.message,
      4000
    );


  const contactIntent =
    cleanOptionalString(
      body.contact_intent,
      50
    );


  const bookingType =
    cleanOptionalString(
      body.booking_type,
      50
    );


  const eventDate =
    cleanOptionalString(
      body.event_date,
      20
    );


  if (!name) {

    return jsonResponse(
      {
        error:
          "Name is required."
      },
      400
    );

  }


  if (
    !email ||
    !isValidEmail(
      email
    )
  ) {

    return jsonResponse(
      {
        error:
          "A valid email is required."
      },
      400
    );

  }


  if (!message) {

    return jsonResponse(
      {
        error:
          "Message is required."
      },
      400
    );

  }


  const allowedIntents = [
    "",
    "BOOKING",
    "INFO",
    "COLLABORATION",
    "HELLO"
  ];


  const normalizedIntent =
    (
      contactIntent || ""
    )
      .toUpperCase();


  if (
    !allowedIntents.includes(
      normalizedIntent
    )
  ) {

    return jsonResponse(
      {
        error:
          "Invalid contact type."
      },
      400
    );

  }


  const allowedBookingTypes = [
    "",
    "HOTEL",
    "VENUE",
    "WEDDING",
    "PRIVATE_EVENT",
    "OTHER"
  ];


  const normalizedBookingType =
    (
      bookingType || ""
    )
      .toUpperCase();


  if (
    !allowedBookingTypes.includes(
      normalizedBookingType
    )
  ) {

    return jsonResponse(
      {
        error:
          "Invalid booking type."
      },
      400
    );

  }


  if (
    eventDate &&
    !/^\d{4}-\d{2}-\d{2}$/
      .test(eventDate)
  ) {

    return jsonResponse(
      {
        error:
          "Invalid event date."
      },
      400
    );

  }


  const result =
    await env.DB
      .prepare(`
        INSERT INTO contact_messages (
          name,
          email,
          subject,
          message,
          contact_intent,
          booking_type,
          event_date,
          status
        )

        VALUES (
          ?,
          ?,
          NULL,
          ?,
          ?,
          ?,
          ?,
          'UNREAD'
        )
      `)
      .bind(
        name,
        email,
        message,
        normalizedIntent || null,
        normalizedBookingType || null,
        eventDate || null
      )
      .run();


  return jsonResponse(
    {
      success: true,

      id:
        result.meta
          ?.last_row_id
    },
    201
  );

}


/* ============================================================
   ADMIN MESSAGES
============================================================ */

async function getMessages(
  env
) {

  const result =
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
          datetime(created_at) DESC,
          id DESC
      `)
      .all();


  return jsonResponse(
    result.results || []
  );

}


async function getMessage(
  id,
  env
) {

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

        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!message) {

    return jsonResponse(
      {
        error:
          "Message not found"
      },
      404
    );

  }


  return jsonResponse(
    message
  );

}


async function getUnreadMessageCount(
  env
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


  return jsonResponse({
    count:
      Number(
        result?.count || 0
      )
  });

}


async function updateMessage(
  id,
  request,
  env
) {

  const existing =
    await env.DB
      .prepare(`
        SELECT
          id,
          status

        FROM contact_messages

        WHERE id = ?

        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!existing) {

    return jsonResponse(
      {
        error:
          "Message not found"
      },
      404
    );

  }


  const body =
    await readJsonBody(
      request
    );


  const status =
    cleanString(
      body.status,
      20
    )
      .toUpperCase();


  const allowedStatuses = [
    "UNREAD",
    "READ",
    "ARCHIVED"
  ];


  if (
    !allowedStatuses.includes(
      status
    )
  ) {

    return jsonResponse(
      {
        error:
          "Invalid message status."
      },
      400
    );

  }


  if (
    status ===
    "UNREAD"
  ) {

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

  }


  if (
    status ===
    "READ"
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

  }


  if (
    status ===
    "ARCHIVED"
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


  return jsonResponse({
    success: true,
    status
  });

}


async function deleteMessage(
  id,
  env
) {

  const existing =
    await env.DB
      .prepare(`
        SELECT id

        FROM contact_messages

        WHERE id = ?

        LIMIT 1
      `)
      .bind(id)
      .first();


  if (!existing) {

    return jsonResponse(
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


  return jsonResponse({
    success: true
  });

}


/* ============================================================
   ADMIN LOGIN
============================================================ */

async function loginAdmin(
  request,
  env
) {

  const body =
    await readJsonBody(
      request
    );


  const password =
    String(
      body.password || ""
    );


  if (!password) {

    return jsonResponse(
      {
        error:
          "Password required"
      },
      400
    );

  }


  if (
    !env.ADMIN_PASSWORD
  ) {

    console.error(
      "ADMIN_PASSWORD secret is missing"
    );


    return jsonResponse(
      {
        error:
          "Admin authentication is not configured."
      },
      500
    );

  }


  const valid =
    await secureStringCompare(
      password,
      env.ADMIN_PASSWORD
    );


  if (!valid) {

    return jsonResponse(
      {
        error:
          "Password non corretta."
      },
      401
    );

  }


  const token =
    await createAdminToken(
      env
    );


  const cookie = [

    `om_admin=${token}`,

    "Path=/",

    "HttpOnly",

    "Secure",

    "SameSite=Lax",

    `Max-Age=${60 * 60 * 24 * 30}`

  ]
    .join("; ");


  return jsonResponse(
    {
      success: true
    },
    200,
    {
      "Set-Cookie":
        cookie
    }
  );

}


function logoutAdmin() {

  return jsonResponse(
    {
      success: true
    },
    200,
    {
      "Set-Cookie":
        [
          "om_admin=",
          "Path=/",
          "HttpOnly",
          "Secure",
          "SameSite=Lax",
          "Max-Age=0"
        ]
          .join("; ")
    }
  );

}


async function isAuthenticated(
  request,
  env
) {

  if (
    !env.ADMIN_PASSWORD
  ) {

    return false;

  }


  const cookies =
    parseCookies(
      request.headers
        .get("Cookie") ||
      ""
    );


  const suppliedToken =
    cookies.om_admin;


  if (!suppliedToken) {

    return false;

  }


  const expectedToken =
    await createAdminToken(
      env
    );


  return secureStringCompare(
    suppliedToken,
    expectedToken
  );

}


async function createAdminToken(
  env
) {

  const source =
    `orange-may-admin-v2:${env.ADMIN_PASSWORD}`;


  return sha256Hex(
    source
  );

}


/* ============================================================
   STATIC ASSETS
============================================================ */

async function serveAsset(
  request,
  env,
  pathname
) {

  if (
    !env.ASSETS
  ) {

    return new Response(
      "Assets binding not available",
      {
        status: 500
      }
    );

  }


  const url =
    new URL(
      request.url
    );


  url.pathname =
    pathname;


  const assetRequest =
    new Request(
      url.toString(),
      request
    );


  return env.ASSETS.fetch(
    assetRequest
  );

}


/* ============================================================
   JSON HELPERS
============================================================ */

async function readJsonBody(
  request
) {

  try {

    const body =
      await request.json();


    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {

      throw new Error();

    }


    return body;

  } catch {

    throw new HttpError(
      400,
      "Invalid JSON body."
    );

  }

}


function jsonResponse(
  data,
  status = 200,
  extraHeaders = {}
) {

  return new Response(
    JSON.stringify(
      data
    ),
    {
      status,

      headers: {

        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store",

        ...extraHeaders

      }
    }
  );

}


function redirectResponse(
  location
) {

  return new Response(
    null,
    {
      status: 302,

      headers: {
        Location:
          location
      }
    }
  );

}


/* ============================================================
   VALIDATION HELPERS
============================================================ */

function cleanString(
  value,
  maxLength = 1000
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(value)
    .trim()
    .slice(
      0,
      maxLength
    );

}


function cleanOptionalString(
  value,
  maxLength = 1000
) {

  const cleaned =
    cleanString(
      value,
      maxLength
    );


  return cleaned ||
    null;

}


function isValidTime(
  value
) {

  return /^([01]\d|2[0-3]):[0-5]\d$/
    .test(value);

}


function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);

}


function isValidHttpUrl(
  value
) {

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


/* ============================================================
   COOKIE HELPERS
============================================================ */

function parseCookies(
  cookieHeader
) {

  const cookies = {};


  cookieHeader
    .split(";")
    .forEach(part => {

      const index =
        part.indexOf("=");


      if (
        index === -1
      ) {

        return;

      }


      const key =
        part
          .slice(
            0,
            index
          )
          .trim();


      const value =
        part
          .slice(
            index + 1
          )
          .trim();


      if (key) {

        cookies[key] =
          value;

      }

    });


  return cookies;

}


/* ============================================================
   CRYPTO HELPERS
============================================================ */

async function sha256Hex(
  value
) {

  const data =
    new TextEncoder()
      .encode(
        value
      );


  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );


  return Array
    .from(
      new Uint8Array(
        digest
      )
    )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(
            2,
            "0"
          )
    )
    .join("");

}


async function secureStringCompare(
  a,
  b
) {

  const hashA =
    await sha256Hex(
      String(a)
    );


  const hashB =
    await sha256Hex(
      String(b)
    );


  return (
    hashA ===
    hashB
  );

}


/* ============================================================
   PATH
============================================================ */

function normalizePath(
  pathname
) {

  if (!pathname) {

    return "/";

  }


  if (
    pathname.length > 1 &&
    pathname.endsWith("/")
  ) {

    return pathname.slice(
      0,
      -1
    );

  }


  return pathname;

}


/* ============================================================
   CUSTOM ERROR
============================================================ */

class HttpError
  extends Error {

  constructor(
    status,
    message
  ) {

    super(
      message
    );


    this.status =
      status;

  }

}
