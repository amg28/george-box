import path from "node:path";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createEmitters } from "./realtime/emitters";
import { registerSocketHandlers } from "./realtime/socket-handlers";
import { registerRoutes } from "./http/routes";
import { SessionStore } from "./session-store";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const store = new SessionStore();
const emitters = createEmitters(io);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(process.cwd(), "public")));

registerRoutes(app, store);
registerSocketHandlers(io, store, emitters);

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Quiz MVP server running on http://localhost:${port}`);
});
