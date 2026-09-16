/// <reference path="../pb_data/types.d.ts" />
/* ============================================================
   device_alerts — a log, not a lock. Nothing in this app blocks a
   second device from signing in; this collection just gives
   admins a paper trail when a student/staff account's QR gets
   verified from a device_id different than the one last seen, so
   they can look into it (shared card, lost card, etc.) rather than
   the system deciding on its own.

   Only ever written by /api/custom/verify-qr in pb_hooks/main.pb.js
   (via app.save(), which bypasses API rules), so createRule is
   left at null — nobody can create rows through the client API.
   ============================================================ */
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": "@request.auth.collectionName = 'admins'",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text_da_id",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text_da_role",
        "max": 0,
        "min": 0,
        "name": "role",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text_da_record_id",
        "max": 0,
        "min": 0,
        "name": "record_id",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text_da_full_name",
        "max": 0,
        "min": 0,
        "name": "full_name",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text_da_school_id",
        "max": 0,
        "min": 0,
        "name": "school_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text_da_prev_device",
        "max": 0,
        "min": 0,
        "name": "previous_device_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text_da_new_device",
        "max": 0,
        "min": 0,
        "name": "new_device_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "autodate_da_created",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_device_alerts",
    "indexes": [
      "CREATE INDEX idx_device_alerts_record ON device_alerts (record_id)"
    ],
    "listRule": "@request.auth.collectionName = 'admins'",
    "name": "device_alerts",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": "@request.auth.collectionName = 'admins'"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_device_alerts");
  return app.delete(collection);
})
