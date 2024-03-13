const cluster = require('node:cluster');
const http = require('node:http');
const numCPUs = require('node:os').availableParallelism();
const process = require('node:process');
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");
const { Server } = require("socket.io");
const { info } = require('node:console');
const express = require("express");
const Redis = require("ioredis");
if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);

    const httpServer = http.createServer();
    httpServer.listen(3000);
    setupMaster(httpServer, {
        loadBalancingMethod: "least-connection"
    });

    setupPrimary();
    cluster.setupPrimary({
        serialization: "advanced"
    });

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
      });
} else {
    console.log(`Worker ${process.pid} started`);
    const redisClient = new Redis();

    const app = express();
    const httpServer = http.createServer(app);
    const io = new Server(httpServer);

    io.adapter(createAdapter());

    setupWorker(io);

    io.on("connection", async (socket) => {


        // Fetching all the messages from redis
        const existingMessages = await redisClient.lrange("chat_messages", 0, -1);

        // Parsing the messages to JSON
        const parsedMessages = existingMessages.map((item) => JSON.parse(item));

        // Sending all the messages to the user
        socket.emit("historical_messages", parsedMessages.reverse());

        // Handling socket connections.
        socket.on("message", (data) => {
            console.log(`Message arrived at ${process.pid}:, data`);
            redisClient.lpush("chat_messages", JSON.stringify(data));
            socket.emit("message",data);
          
        });
    });

    app.use(express.static('public'))

}