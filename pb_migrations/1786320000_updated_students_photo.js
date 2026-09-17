/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("students")

  // add field only if it doesn't already exist
  const alreadyExists = collection.fields.some((f) => f.name === "photo" || f.id === "file_student_photo")
  if (!alreadyExists) {
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
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("students")

  // remove field
  collection.fields.removeById("file_student_photo")

  return app.save(collection)
})
