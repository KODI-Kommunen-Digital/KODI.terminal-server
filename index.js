require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
// const morgan = require("morgan");
const AppError = require("./utils/appError");
// const fileUpload = require("express-fileupload");
const headers = require("./middlewares/headers")


const app = express();

const message = {
    message: "Hello world! Welcome to HEIDI Terminal!!",
};

app.use(helmet());
app.use(bodyParser.json());

app.use(cors());
app.use(headers)

app.get("/", (req, res) => {
    res.send(message);
});

app.get("/startPayment", (req,res) => {
    res.send("Successful")
});

app.all("*", (req, res, next) => {
    next(new AppError(`The URL ${req.originalUrl} does not exists`, 404));
});
app.listen(process.env.PORT, () => {
    console.log(`listening on port ${process.env.PORT}`);
});