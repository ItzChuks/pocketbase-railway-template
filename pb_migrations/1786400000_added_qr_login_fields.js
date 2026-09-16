/// <reference path="../pb_data/types.d.ts" />
/* ============================================================
   Adds the three fields the QR-login flow needs, to BOTH the
   students and staff collections:
     - qr_secret       random token generated once at account
                        creation (see pb_hooks/main.pb.js), encoded
                        into the QR code printed on the back of the
                        ID card. Not shown anywhere in the UI as
                        text — only ever read back out by the
                        camera scan on the login screen.
     - last_device_id  a random id the browser generates for itself
                        and stores in localStorage (see
                        js/qr-auth.js). Updated on every successful
                        QR verification.
     - last_login_at   timestamp of that same successful verification.

   These three together are what /api/custom/verify-qr (in
   pb_hooks/main.pb.js) uses to check the scanned code and to spot
   a login from a device different than the one last seen — see
   that route for how the device_alerts collection (next migration)
   gets used.
   ============================================================ */
migrate((app) => {
  ["students", "staff"].forEach((name) => {
    const collection = app.findCollectionByNameOrId(name);

    collection.fields.add(new Field({
      "hidden": false,
      "id": "text_qr_secret_" + name,
      "max": 0,
      "min": 0,
      "name": "qr_secret",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }));

    collection.fields.add(new Field({
      "hidden": false,
      "id": "text_last_device_" + name,
      "max": 0,
      "min": 0,
      "name": "last_device_id",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }));

    collection.fields.add(new Field({
      "hidden": false,
      "id": "date_last_login_" + name,
      "name": "last_login_at",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "date"
    }));

    app.save(collection);
  });
}, (app) => {
  ["students", "staff"].forEach((name) => {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.removeById("text_qr_secret_" + name);
    collection.fields.removeById("text_last_device_" + name);
    collection.fields.removeById("date_last_login_" + name);
    app.save(collection);
  });
})
