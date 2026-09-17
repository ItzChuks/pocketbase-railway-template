/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("students")

  try {
    // add field
    collection.fields.addAt(18, new Field({
      "hidden": false,
      "id": "file_student_photo",
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
  const collection = app.findCollectionByNameOrId("students")

  // remove field
  collection.fields.removeById("file_student_photo")

  return app.save(collection)
})
