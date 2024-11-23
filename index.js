require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const ipfilter = require('express-ipfilter').IpFilter
const IpDeniedError = require('express-ipfilter').IpDeniedError
const barcodeScanner = require('./services/barcodeScanner');
const nfcReader = require('./services/nfcReader');
const cashMachineRoutes = require('./routes/cashMachineRoutes');
const posRoutes = require('./routes/posRoutes');



const app = express();

const message = {
    message: "Hello world! Welcome to HEIDI Terminal!!",
};

app.use(helmet());
app.use(bodyParser.json());
app.use((err, req, res, _next) => {
    if (err instanceof IpDeniedError) {
        res.status(401).send("Access Denied");
    } else {
        res.status(err.status || 500);
    }
});

app.use(cors());
app.use("/cashMachine", cashMachineRoutes);

app.get("/", (req, res) => {
    res.send(message);
});
app.use(posRoutes);


// Catch-all route for handling 404 errors
app.use((req, res) => {
    res.status(404).json({
        status: "error",
        message: `The URL ${req.originalUrl} does not exist`,
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        status: "error",
        message: err.message || "Internal Server Error",
    });
});

// Start NFC Reader and Barcode Scanner
nfcReader.start();
barcodeScanner.start();

// Check NFC Reader availability periodically and restart if necessary
setInterval(() => {
    try {
        if (!nfcReader.isNFCAvailable()) {
            console.log("NFC Reader is inactive. Restarting...");
            nfcReader.start();
        }
    } catch (error) {
        console.error("Error checking NFC Reader status:", error.message);
    }
}, 30000); // Check every 30 seconds

const port = process.env.PORT || 3050;
app.listen(port, () => {
    console.log(`listening on port ${port}`);
});