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

  (async () => {
    const movieDetails = await getMovieDetails(id);
    res.send(movieDetails);
  })().catch((err) => res.send({ message: "movie data not available" }));
});

io.on("connection", (socket) => {
  console.log("socket joined");

  socket.on("createroom", function (room) {
    if (socket.rooms.has(room)) {
    } else if (io.sockets.adapter.rooms.has(room)) {
      socket.emit("exception", "Room already exists, please pick a new name!");
    } else {
      socket.join(room);
      console.log("joined room", room);
    }
  });

  socket.on("joinroom", function (room) {
    if (io.sockets.adapter.rooms.has(room)) {
      socket.join(room);
      console.log("joined room", room);
    } else {
      socket.emit("exception", "Room does not exist, please create it first!");
    }
  });

  socket.on("selected", function (magnet) {
    roomsArray = [...socket.rooms];
    currentRoom = roomsArray[roomsArray.length - 1];
    console.log(currentRoom);
    console.log(socket.rooms);
    socket.to(currentRoom).emit("start", magnet);
  });

  socket.on("disconnect", function () {
    console.log("socket disconnected");
  });
});

server.listen(port, () => {
  console.log("listening on localhost: " + port);
});
