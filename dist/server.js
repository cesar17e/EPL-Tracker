import dotenv from "dotenv";
import express from "express";
dotenv.config(); // Load variables from .env
const port = Number(process.env.PORT) || 8000;
const app = express();
app.get("/", (req, res) => {
    res.send("Hello from express + ts, hiii!");
});
app.listen(port, () => {
    console.log('now listening on port, hiii');
});
//# sourceMappingURL=server.js.map