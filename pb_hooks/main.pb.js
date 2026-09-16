/// <reference path="../pb_data/types.d.ts" />

/* ============================================================
   main.pb.js — server-side custom routes, running inside
   PocketBase's own process (the JS VM plugin — no separate Node
   service to deploy or keep alive).

   Replaces Appwrite's two Functions:
     - create-account  -> POST /api/custom/create-account
     - save-scores     -> not needed anymore. Scores can be written
       directly from staff.js, because the "scores" collection's API
       rule (see scripts/setup-pocketbase.js) lets a student read
       their OWN row via `student_auth_id = @request.auth.id`
       directly — no per-document permission grant needed the way
       Appwrite's document security required.

   NOTE ON STRUCTURE: everything each route needs lives INSIDE that
   route's own handler function — no shared top-level functions or
   consts referenced across routerAdd() calls. An earlier version
   split things into shared helper functions and hit
   "ReferenceError: ... is not defined" at request time, which
   means PocketBase's JS VM doesn't reliably share top-level
   bindings across separately-registered route handlers the way a
   normal browser script would. Duplicating the ~10 lines of
   shared logic below is the trade-off for that being reliable.

   If you upgrade PocketBase and this starts throwing
   "... is not a function" instead, check
   https://pocketbase.io/docs/js-routing/ for renamed methods.
   ============================================================ */

routerAdd(
  "POST",
  "/api/custom/create-account",
  (e) => {
    try {
      const SCHOOL_NAME = "Chuvera";
      const STUDENT_EMAIL_DOMAIN = "students.eliasschool.local";
      const STAFF_EMAIL_DOMAIN = "staff.eliasschool.local";
      const STUDENTS_COLLECTION = "students";
      const STAFF_COLLECTION = "staff";
      const ADMINS_COLLECTION = "admins";
      // Keep the two domains + SCHOOL_NAME in sync with js/pocketbase-config.js.

      const isAdmin = !!e.auth && e.auth.collection().name === ADMINS_COLLECTION;
      const isStaff = !!e.auth && e.auth.collection().name === STAFF_COLLECTION;

      if (!isAdmin && !isStaff) {
        return e.json(403, { error: "Only admins and staff can create accounts." });
      }

      const body = e.requestInfo().body || {};

      const role = body.role;
      if (role !== "student" && role !== "staff") {
        return e.json(400, { error: 'role must be "student" or "staff".' });
      }

      if (!isAdmin) {
        // Caller is staff: narrower than admin, same rules the
        // Appwrite Function enforced.
        if (role !== "student") {
          return e.json(403, { error: "Staff can only add student accounts." });
        }
        const className = (body.className || "").trim();
        const arm = (body.arm || "").trim();
        const assigned = e.auth.get("classes") || [];
        const allowed = assigned.includes(className) || (arm && assigned.includes(`${className} (${arm})`));
        if (!allowed) {
          return e.json(403, { error: "You can only add students to a class you're assigned to." });
        }
      }

      const fullName = (body.fullName || "").trim();
      if (!fullName) {
        return e.json(400, { error: "fullName is required." });
      }

      const collectionName = role === "student" ? STUDENTS_COLLECTION : STAFF_COLLECTION;
      const emailDomain = role === "student" ? STUDENT_EMAIL_DOMAIN : STAFF_EMAIL_DOMAIN;
      const prefix = SCHOOL_NAME.slice(0, 3).toUpperCase();

      // Generate a unique school ID server-side.
      let schoolId = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const digits = String(1000 + Math.floor(Math.random() * 9000));
        const candidate = `${prefix}-${digits}`;
        try {
          e.app.findFirstRecordByFilter(collectionName, "school_id = {:id}", { id: candidate });
          // found -> taken, try again
        } catch (notFound) {
          schoolId = candidate;
          break;
        }
      }
      if (!schoolId) {
        return e.json(500, { error: "Could not generate a unique ID after several attempts. Try again." });
      }

      const email = `${schoolId.toLowerCase()}@${emailDomain}`;

      const collection = e.app.findCollectionByNameOrId(collectionName);
      const record = new Record(collection);
      record.set("email", email);
      record.set("emailVisibility", false);
      record.set("verified", true);
      record.setPassword(schoolId);
      record.set("full_name", fullName);
      record.set("school_id", schoolId);

      // Random token for the QR code printed on the back of this
      // person's ID card (see js/qr-auth.js + /api/custom/verify-qr
      // below). Not derived from anything guessable like the school
      // ID, so a card has to actually be photographed/scanned —
      // knowing the name + school ID alone (both printed on the
      // FRONT of the card) isn't enough on its own anymore.
      let qrSecret = "";
      for (let i = 0; i < 4; i++) {
        qrSecret += Math.random().toString(36).slice(2, 10);
      }
      record.set("qr_secret", qrSecret);

      if (role === "student") {
        record.set("class_id", body.classId || "");
        record.set("class_name", body.className || "");
        record.set("arm", body.arm || "");
        record.set("department", body.department || "");
        record.set("subjects", body.subjects || []);
        record.set("guardian_name", body.guardianName || "");
        record.set("guardian_phone", body.guardianPhone || "");
        record.set("guardian_email", body.guardianEmail || "");
      } else {
        record.set("position", body.position || "");
        record.set("classes", body.classes || []);
        record.set("subjects", body.subjects || []);
      }

      try {
        e.app.save(record);
      } catch (err) {
        return e.json(500, { error: "Could not create the account: " + err });
      }

      return e.json(200, { schoolId, userId: record.id, qrSecret });
    } catch (err) {
      // Catches literally anything unexpected (a typo, a renamed
      // JSVM method after a PocketBase upgrade, etc.) and puts the
      // REAL error message in the response instead of letting it
      // fall through to PocketBase's generic "Something went
      // wrong..." text, which gives you nothing to debug from.
      return e.json(500, { error: "create-account crashed: " + err });
    }
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/custom/delete-account",
  (e) => {
    try {
      const STUDENTS_COLLECTION = "students";
      const STAFF_COLLECTION = "staff";
      const ADMINS_COLLECTION = "admins";

      const isAdmin = !!e.auth && e.auth.collection().name === ADMINS_COLLECTION;
      if (!isAdmin) {
        return e.json(403, { error: "Only admins can delete accounts." });
      }

      const body = e.requestInfo().body || {};

      const role = body.role;
      if (role !== "student" && role !== "staff") {
        return e.json(400, { error: 'role must be "student" or "staff".' });
      }
      const userId = (body.userId || "").trim();
      if (!userId) {
        return e.json(400, { error: "userId is required." });
      }

      const collectionName = role === "student" ? STUDENTS_COLLECTION : STAFF_COLLECTION;

      let record;
      try {
        record = e.app.findRecordById(collectionName, userId);
      } catch (notFound) {
        // Already gone — treat as success (the admin might be
        // retrying after a partial earlier failure), same as the
        // Appwrite version.
        return e.json(200, { success: true });
      }

      try {
        e.app.delete(record);
      } catch (err) {
        return e.json(500, { error: "Deleting the account failed: " + err });
      }

      return e.json(200, { success: true });
    } catch (err) {
      return e.json(500, { error: "delete-account crashed: " + err });
    }
  },
  $apis.requireAuth()
);

/* ============================================================
   /api/custom/verify-qr — second step of login, called from
   js/qr-auth.js AFTER authWithPassword() already succeeded (so
   e.auth below is the student/staff record that just signed in
   with name + school ID). Checks the secret the camera decoded
   from the physical ID card's QR against that record's qr_secret,
   and — log only, never blocking, per how this school wants it —
   notes it in device_alerts when the device_id looks different
   from the one last seen for this account, so admins/staff can
   review it themselves.
   ============================================================ */
routerAdd(
  "POST",
  "/api/custom/verify-qr",
  (e) => {
    try {
      const STUDENTS_COLLECTION = "students";
      const STAFF_COLLECTION = "staff";
      const DEVICE_ALERTS_COLLECTION = "device_alerts";

      if (!e.auth) {
        return e.json(401, { error: "Not signed in." });
      }
      const collectionName = e.auth.collection().name;
      if (collectionName !== STUDENTS_COLLECTION && collectionName !== STAFF_COLLECTION) {
        return e.json(403, { error: "QR verification only applies to student/staff accounts." });
      }

      const body = e.requestInfo().body || {};
      const secret = (body.secret || "").trim();
      const deviceId = (body.deviceId || "").trim();

      if (!secret) {
        return e.json(400, { error: "No QR data received." });
      }
      if (!deviceId) {
        return e.json(400, { error: "deviceId is required." });
      }

      // Re-load the record fresh (e.auth can be a snapshot from
      // token verification) so we're comparing against — and later
      // writing — the current row, not a stale copy.
      const record = e.app.findRecordById(collectionName, e.auth.id);

      const storedSecret = record.get("qr_secret") || "";
      if (!storedSecret || secret !== storedSecret) {
        return e.json(401, { error: "That QR code doesn't match this account's ID card." });
      }

      const previousDeviceId = record.get("last_device_id") || "";
      if (previousDeviceId && previousDeviceId !== deviceId) {
        try {
          const alertsCollection = e.app.findCollectionByNameOrId(DEVICE_ALERTS_COLLECTION);
          const alert = new Record(alertsCollection);
          alert.set("role", collectionName);
          alert.set("record_id", record.id);
          alert.set("full_name", record.get("full_name") || "");
          alert.set("school_id", record.get("school_id") || "");
          alert.set("previous_device_id", previousDeviceId);
          alert.set("new_device_id", deviceId);
          e.app.save(alert);
        } catch (alertErr) {
          // Never let logging the alert block the actual sign-in.
        }
      }

      record.set("last_device_id", deviceId);
      record.set("last_login_at", new Date().toISOString());
      e.app.save(record);

      return e.json(200, { success: true });
    } catch (err) {
      return e.json(500, { error: "verify-qr crashed: " + err });
    }
  },
  $apis.requireAuth()
);

/* ============================================================
   /api/custom/ensure-qr — backfills qr_secret for an account
   created before the QR-login feature existed (new accounts
   already get one at creation — see create-account above).
   Called from js/pdf-utils.js right before printing an ID card
   whenever the record it's given has no qr_secret yet, so simply
   (re)printing someone's card is what "turns on" QR login for
   them. Safe to call repeatedly — a record that already has a
   secret just gets handed the existing one back unchanged.
   ============================================================ */
routerAdd(
  "POST",
  "/api/custom/ensure-qr",
  (e) => {
    try {
      const STUDENTS_COLLECTION = "students";
      const STAFF_COLLECTION = "staff";
      const ADMINS_COLLECTION = "admins";

      if (!e.auth) return e.json(401, { error: "Not signed in." });

      const body = e.requestInfo().body || {};
      const role = body.role;
      const recordId = (body.recordId || "").trim();
      if (role !== "student" && role !== "staff") {
        return e.json(400, { error: 'role must be "student" or "staff".' });
      }
      if (!recordId) {
        return e.json(400, { error: "recordId is required." });
      }
      const collectionName = role === "student" ? STUDENTS_COLLECTION : STAFF_COLLECTION;

      const isAdmin = e.auth.collection().name === ADMINS_COLLECTION;
      const isSelf = e.auth.collection().name === collectionName && e.auth.id === recordId;
      if (!isAdmin && !isSelf) {
        return e.json(403, { error: "You can only generate a QR code for your own account." });
      }

      let record;
      try {
        record = e.app.findRecordById(collectionName, recordId);
      } catch (notFound) {
        return e.json(404, { error: "Account not found." });
      }

      let qrSecret = record.get("qr_secret");
      if (!qrSecret) {
        qrSecret = "";
        for (let i = 0; i < 4; i++) qrSecret += Math.random().toString(36).slice(2, 10);
        record.set("qr_secret", qrSecret);
        try {
          e.app.save(record);
        } catch (err) {
          return e.json(500, { error: "Couldn't save the new QR code: " + err });
        }
      }

      return e.json(200, { qrSecret });
    } catch (err) {
      return e.json(500, { error: "ensure-qr crashed: " + err });
    }
  },
  $apis.requireAuth()
);

/* ============================================================
   /api/custom/career-chat — the student-facing "Career Guide"
   chatbot (js/career-chat.js). Runs server-side so the Anthropic
   API key never reaches the browser. The API key itself is read
   from an environment variable on the machine running PocketBase
   ("ANTHROPIC_API_KEY") — see README-POCKETBASE.md for how to set
   it — never hardcode it here.

   The system prompt is what actually keeps the bot "on topic": it's
   told to only discuss education/career questions and to decline
   anything else, but that's a steering instruction, not a hard
   guarantee — treat this as helpful guidance for students, not a
   substitute for the school's own careers counselling.
   ============================================================ */
routerAdd(
  "POST",
  "/api/custom/career-chat",
  (e) => {
    try {
      const STUDENTS_COLLECTION = "students";
      const MAX_MESSAGE_LEN = 1500;
      const MAX_HISTORY_TURNS = 8; // last N user+assistant messages kept, older ones dropped

      if (!e.auth || e.auth.collection().name !== STUDENTS_COLLECTION) {
        return e.json(403, { error: "The career guide is only available to signed-in students." });
      }

      const apiKey = $os.getenv("ANTHROPIC_API_KEY");
      if (!apiKey) {
        return e.json(500, { error: "Career guide isn't set up yet — ask an admin to configure ANTHROPIC_API_KEY on the server." });
      }

      const body = e.requestInfo().body || {};
      const message = (body.message || "").trim();
      if (!message) {
        return e.json(400, { error: "Type a question first." });
      }
      if (message.length > MAX_MESSAGE_LEN) {
        return e.json(400, { error: "That message is too long — try asking in a shorter way." });
      }

      // Trust only role/content out of whatever history the client
      // sent, cap length per turn, and keep just the most recent
      // turns so a long-running chat can't grow the request (and the
      // model's context) without bound.
      const rawHistory = Array.isArray(body.history) ? body.history : [];
      const history = rawHistory
        .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .slice(-MAX_HISTORY_TURNS)
        .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE_LEN) }));

      const studentName = e.auth.get("full_name") || "the student";
      const studentClass = e.auth.get("class_name") || "";

      const systemPrompt =
        "You are the Career Guide, a friendly educational and career-advice assistant embedded in a school portal called Chuvera, for a Nigerian secondary school. " +
        `You are currently chatting with ${studentName}${studentClass ? ", who is in " + studentClass : ""}. ` +
        "Only discuss topics genuinely related to education and career planning: choosing subjects/subject combinations, study skills and exam prep (including WAEC/NECO/JAMB in general terms), career paths and what they involve, university/course/scholarship guidance, and similar. " +
        "If the student asks about anything outside that scope (entertainment, relationships, unrelated general knowledge, requests to do their homework/exams for them, or anything else), politely decline and steer the conversation back to education/career topics — do not answer the off-topic question. " +
        "Keep replies concise (a few short paragraphs or a short list at most), encouraging, and age-appropriate for a secondary school student. " +
        "You don't have access to this specific school's official records, deadlines, or admission cutoffs, so for anything time-sensitive or school-specific, tell the student to confirm with their teacher, school counselor, or the relevant institution's official source rather than presenting a guess as fact.";

      const payload = {
        model: "claude-sonnet-5",
        max_tokens: 700,
        system: systemPrompt,
        messages: [...history, { role: "user", content: message }],
      };

      const res = $http.send({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        timeout: 30,
      });

      let data;
      try {
        data = JSON.parse(res.raw);
      } catch (parseErr) {
        return e.json(502, { error: "Career guide got an unreadable response — please try again." });
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        const upstreamMsg = data?.error?.message || `status ${res.statusCode}`;
        return e.json(502, { error: "Career guide is temporarily unavailable: " + upstreamMsg });
      }

      const reply = (data.content || [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!reply) {
        return e.json(502, { error: "Career guide didn't return a reply — please try again." });
      }

      return e.json(200, { reply });
    } catch (err) {
      return e.json(500, { error: "career-chat crashed: " + err });
    }
  },
  $apis.requireAuth()
);
