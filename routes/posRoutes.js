// paymentRoutes.js

const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { encrypt } = require("../utils/AES");
const axios = require('axios');
const StoreCardTransactionEnums = require("../constants/databaseEnums")
const env = require('dotenv').config().parsed;


const router = express.Router();
// Directory for logging
// const logDir = path.join('logs', 'pos_system');
// if (!fs.existsSync(logDir)) {
//     fs.mkdirSync(logDir, { recursive: true });
// }


  

// Helper function to log messages
// function logMessage(message) {
//     const timestamp = new Date().toISOString();
//     const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
//     fs.appendFileSync(logFile, `${timestamp}: ${message}\n`);
// }

const logDir = path.join(__dirname, '..', 'logs', 'posSystem');

function getLogFilename() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = now.toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = now.getFullYear();
    return path.join(logDir, `${day}${month}${year}.log`);
}

function logMessage(message, severity = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${severity}: ${message}\n`;
    const logFile = getLogFilename();

    // Ensure the log directory exists
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFile(logFile, logMessage, (err) => {
        if (err) console.error('Error writing to log file:', err);
    });

    // Log to console as well
    console.log(logMessage);
}

const paymentStatus = {
    pending: 1,
    paid: 2,
    failed: 3,
    cancelled: 4,
    refundPending: 5,
    refunded: 6
}

// Define the /startpayment endpoint
router.post("/startpayment", async (req, res) => {
    try {
        logMessage("Received request to /startpayment endpoint");

        const cartId = Number(req.body.cartId);
        if (isNaN(cartId)) {
            logMessage(`Invalid cartId sent: ${cartId}`, "ERROR");
            return res.status(400).send("Invalid cartId sent");
        }

        if (!req.body.userId) {
            logMessage("userId is not sent", "ERROR");
            return res.status(400).send("userId is not sent");
        }

        const userId = Number(req.body.userId);
        if (isNaN(userId)) {
            logMessage(`Invalid userId sent: ${userId}`, "ERROR");
            return res.status(400).send("Invalid userId sent");
        }

        let amount = 0;
        let paymentId = 0;
        let createResponse = {}
        const apiUrl = `${env.CONTAINER_API}/cities/${env.CITYID}/store/${env.STOREID}/createTransaction`;
        const encryptData = encrypt(
            JSON.stringify({ cartId, userId }),
            env.REACT_APP_ENCRYPTION_KEY
        );

        try {
            createResponse = await axios.post(apiUrl, { storeData: encryptData });
            logMessage(`API response: ${JSON.stringify(createResponse.data)}`);

            amount = createResponse.data.data.order.amount;
            paymentId = createResponse.data.data.order.paymentId;
        } catch (error) {
            logMessage(`API Error: ${error.message}`, "ERROR");
            return res.status(400).send("Failed");
        }

        // logMessage(`Starting payment process for Amount: ${amount}, CartId: ${cartId}, UserId: ${userId}`);

        // Function to simulate the payment process with a delay
        // const simulatePaymentDelay = () => {
        //     return new Promise(resolve => {
        //         setTimeout(() => {
        //             logMessage("Simulated the time delay");
        //             resolve(); // Resolve after the timeout
        //         }, 2000); // 2-second delay
        //     });
        // };

        // // Call the function to simulate the delay and await it
        // await simulatePaymentDelay();
        
        // logMessage("Updating the payment");

        // const updateApiUrl = `${env.CONTAINER_API}/cities/${env.CITYID}/store/${env.STOREID}/updateTransaction`;
        // const updateEncryptData = encrypt(
        //     JSON.stringify({ paymentId, status: paymentStatus.paid, externalPaymentId: "xyz123", paymentProviderType: "Stripe" }),
        //     env.REACT_APP_ENCRYPTION_KEY
        // );

        // try {
        //     const updateResponse = await axios.post(updateApiUrl, { storeData: updateEncryptData });
        //     logMessage(`Update API response: ${JSON.stringify(updateResponse.data)}`);
        //     res.send(createResponse.data.data);
        // } catch (error) {
        //     logMessage(`Update API Error: ${error.message}`, "ERROR");
        //     res.status(400).send("Failed");
        // }

        const paymentProcess = spawn("./Portalum.Zvt.EasyPay.exe", ["--amount", amount]);

        paymentProcess.stdout.on("data", (data) => {
            logMessage(`Process stdout: ${data}`);
        });

        paymentProcess.stderr.on("data", (data) => {
            logMessage(`Process stderr: ${data}`);
        });

        paymentProcess.on("close", async (returnCode) => {
            logMessage(`Process exited with code ${returnCode}`);
            let status = paymentStatus.paid

            if (returnCode === 0) {
                logMessage("Payment process successful");
            } 
            else {
                status = paymentStatus.failed
                logMessage(`Payment process failed with status code ${returnCode}`, "ERROR");
            }

            const updateApiUrl = `${env.CONTAINER_API}/cities/${env.CITYID}/store/${env.STOREID}/updateTransaction`;
            const updateEncryptData = encrypt(
                JSON.stringify({ paymentId, status }),
                env.REACT_APP_ENCRYPTION_KEY
            );

            try {
                const updateResponse = await axios.post(updateApiUrl, { storeData: updateEncryptData });
                logMessage(`Update API response: ${JSON.stringify(updateResponse.data)}`);
                res.send(createResponse.data.data);
            } catch (error) {
                logMessage(`Update API Error: ${error.message}`, "ERROR");
                res.status(400).send("Failed");
            }
         });
    } catch (error) {
        logMessage(`Unexpected error: ${error.message}`, "ERROR");
        res.status(500).send("Internal Server Error");
    }
});

module.exports = router;
