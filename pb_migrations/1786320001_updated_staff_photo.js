/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("staff")

  try {
    // add field
    collection.fields.addAt(13, new Field({
      "hidden": false,
      "id": "file_staff_photo",
      "maxSelect": 1,
      "maxSize": 5242880,
      "mimeTypes": [
        "image/jpeg",
        "image/png",
        "image/webp"
      ],
      "name": "photo",
      "presentable": false,
      "protected": false,
      "required": false,
      "system": false,
      "thumbs": [
        "100x100"
      ],
      "type": "file"
    }))

    return app.save(collection)
  } catch (e) {
    return; // field already exists — skip
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("staff")

  // remove field
  collection.fields.removeById("file_staff_photo")

  return app.save(collection)
})
