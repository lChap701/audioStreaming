/*
 * Based on:
 * https://medium.com/@richard534/uploading-streaming-audio-using-nodejs-express-mongodb-gridfs-b031a0bcb20f
 */

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { Readable } = require("stream");
require("dotenv").config();

const mongodb = require("mongodb");
const MongoClient = require("mongodb").MongoClient;
const ObjectID = require("mongodb").ObjectID;
let db;

const app = express();
app.use(cors({ origin: "*" }));
app.use("/public", express.static(process.cwd() + "/public"));

// Displays the form
app.route("/").get((req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

// Streams the audio
app.route("/api/audio/:id").get((req, res) => {
  try {
    var trackId = new ObjectID(req.params.id);
  } catch (err) {
    return res.status(400).json({
      message:
        "Invalid ID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters",
    });
  }

  res.set("content-type", "audio/wav");
  res.set("accept-ranges", "bytes");

  let bucket = new mongodb.GridFSBucket(db, {
    bucketName: "tracks",
  });

  let downloadStream = bucket.openDownloadStream(trackId);

  downloadStream.on("data", (chunk) => res.write(chunk));

  downloadStream.on("error", () => res.sendStatus(404));

  downloadStream.on("end", () => {
    res.end();
  });
});

// Stores the audio and displays the result
app.post("/api/audio", (req, res) => {
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  upload.single("upfile")(req, res, (err) => {
    if (err) {
      return res
        .status(400)
        .json({ message: "Upload Request Validation Failed" });
    } else if (!req.file.originalname) {
      return res.status(400).json({ message: "No name in request file" });
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

/**
 * Sets up the DB
 */
const dbSetup = async () => {
  try {
    // Connects to database
    let client = await MongoClient.connect(process.env.DB);
    db = client.db("audioHosting");
  } catch {
    console.log(
      "MongoDB Connection Error. Please make sure that MongoDB is running."
    );
    process.exit(1);
  }
};

const listener = app.listen(3210, () => {
  dbSetup();
  console.log("Your app is listening on port " + listener.address().port);
});
