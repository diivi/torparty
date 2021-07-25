const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const cors = require("cors");

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const yts = require("yts");

const port = process.env.PORT || 3000;

const io = require("socket.io")(server, {
  cors: {
    origin: "http://127.0.0.1:5500",
    methods: ["GET", "POST"],
  },
});

corsOptions = {
  origin: "http://127.0.0.1:5500",
};

app.use(cors(corsOptions));
app.use(express.json());
app.use("/covers", express.static(path.join(__dirname, "covers")));

var rooms = [];
function Room(roomName, host, hostId, magnet) {
  this.name = roomName;
  this.host = host;
  this.hostId = hostId;
  this.users = [host];
  this.magnet = magnet;
  this.currTime = 0;
}

const fileExists = (path) =>
  fs.promises.stat(path).then(
    () => true,
    () => false
  );

const downloadToFile = async (url, filename) => {
  const response = await axios.get(url, { responseType: "stream" });
  return response.data.pipe(fs.createWriteStream(filename));
};

const downloadMovieCover = async (movie) => {
  const filePath = path.join(__dirname, "covers", `${movie.title_english}.png`);

  if (!(await fileExists(filePath))) {
    return downloadToFile(movie.medium_cover_image, filePath);
  }
};

const ytsSearch = (term, limit = 3) =>
  yts.listMovies({ limit, query_term: term });

const searchMovies = async (searchTerm) => (await ytsSearch(searchTerm)).movies;

const getMovieDetails = async (movieId) =>
  await yts.movieDetails({ movie_id: movieId });

app.use("/movie", function (req, res) {
  const { name, room } = req.body;
  if (!name || !room) {
    res.send({ message: "name/movie empty" });
  } else {
    (async () => {
      const movies = await searchMovies(name);
      await Promise.all(movies.map(downloadMovieCover));
      res.send(movies);
    })().catch((err) => res.send({ message: "movie not found" }));
  }
});

app.use("/confirm", function (req, res) {
  const { id, room } = req.body;
  if (rooms.find((roomObj) => roomObj.name === room)) {
    res.send({ message: "room already exists" });
  } else {
    (async () => {
      const movieDetails = await getMovieDetails(id);
      res.send(movieDetails);
    })().catch((err) => res.send({ message: "movie data not available" }));
  }
});

io.on("connection", (socket) => {
  console.log(rooms);
  console.log("socket joined");

  socket.on("createroom", function (data) {
    if (socket.rooms.has(data.room)) {
    } else if (io.sockets.adapter.rooms.has(data.room)) {
      socket.emit("exception", "Room already exists, please pick a new name!");
    } else {
      socket.join(data.room);
      let newRoom = new Room(data.room, "streamer", socket.id, data.magnet);
      rooms.push(newRoom);
      console.log("created and joined room", data.room);
    }
  });

  socket.on("joinroom", function (room) {
    if (io.sockets.adapter.rooms.has(room)) {
      socket.join(room);
      let roomObj = rooms.find((roomObj) => roomObj.name === room);
      roomObj.users.push("watcher");
      console.log("joined room", room);
      socket.to(roomObj.hostId).emit("joined room", roomObj);
    } else {
      socket.emit("exception", "Room does not exist, please create it first!");
    }
  });

  socket.on("set room time", function (data) {
    console.log(data);
    let roomObj = rooms.find((roomObj) => roomObj.name === data.room);
    roomObj.currTime = data.time;
    socket.to(currentRoom).emit("time change", roomObj.time);
  });

  socket.on("selected", function (magnet) {
    roomsArray = [...socket.rooms];
    currentRoom = roomsArray[roomsArray.length - 1];
  });

  socket.on("disconnect", function () {
    let roomObj = rooms.find((roomObj) => roomObj.hostId === socket.id);
    rooms.splice(rooms.indexOf(roomObj), 1);
    console.log("socket disconnected");
  });
});

server.listen(port, () => {
  console.log("listening on localhost: " + port);
});
