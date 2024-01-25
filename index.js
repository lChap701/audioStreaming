/*
 * Based on:
 * https://medium.com/@richard534/uploading-streaming-audio-using-nodejs-express-mongodb-gridfs-b031a0bcb20f
 */

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { Readable } = require("stream");
const axios = require("axios")
require("dotenv").config();

const mongodb = require("mongodb");
const ObjectID = require("mongodb").ObjectId;
const { MongoClient } = require("mongodb");

let db;
// Connects to database
const dbSetup = async () => {
  try {
    let client = new MongoClient(process.env.DB);
    await client.connect();
    console.log("Connected to DB");
    db = client.db();
  } catch (e) {
    console.log(
      "MongoDB Connection Error. Please make sure that MongoDB is running.\n" +
        e
    );
    process.exit(1);
  }
};

const app = express();
app.use(cors({ origin: "*" }));
app.use("/public", express.static(process.cwd() + "/public"));

// Displays the form
app.get("/", (_req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

// Stores the audio and displays the result
app.post("/api/audio", (req, res) => {
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  upload.single("upfile")(req, res, (err) => {
    if (err) {
      res.status(400).json({ message: "Upload Request Validation Failed" });
    } else if (!req.file.originalname) {
      res.status(400).json({ message: "No name in request file" });
    }

    let trackName = req.file.originalname.split(".")[0];

    // Covert buffer to Readable Stream
    const readableTrackStream = new Readable();
    readableTrackStream.push(req.file.buffer);
    readableTrackStream.push(null);

    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: "tracks",
    });

    let uploadStream = bucket.openUploadStream(trackName);
    let id = uploadStream.id;
    readableTrackStream.pipe(uploadStream);

    uploadStream.on("error", () => {
      return res.status(500).json({ message: "Error uploading file" });
    });

    uploadStream.on("finish", () => {
      return res.status(201).json({
        message: `File uploaded successfully, stored under Mongo ObjectID: ${id}. You can view it by adding '/${id}' to the current URL.`,
      });
    });
  });
});

// Streams the audio
app.get("/api/audio/:id", (req, res) => {
  try {
    var trackId = new ObjectID(req.params.id);
    res.set("content-type", "audio/wav");
    res.set("accept-ranges", "bytes");

    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: "tracks",
    });

    let downloadStream = bucket.openDownloadStream(trackId);
    downloadStream.on("data", (chunk) => res.write(chunk));
    downloadStream.on("error", () =>
      res.status(404).send("Unable to stream audio")
    );
    downloadStream.on("end", () => res.end());
  } catch (e) {
    console.log(e);
    res.status(400).json({
      message:
        "Invalid ID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters",
    });
  }
});

const listener = app.listen(3210, () => {
  dbSetup();
  console.log("Your app is listening on port " + listener.address().port);
});
