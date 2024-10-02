// paymentRoutes.js

const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { encrypt } = require("../utils/AES");
const {StoreCardTransactionEnums} = require("../constants/databaseEnums")

const router = express.Router();

// Directory for logging
const logDir = path.join('logs', 'pos_system');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}


  

// Helper function to log messages
function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, `${timestamp}: ${message}\n`);
}

// Define the /startpayment endpoint
router.post("/startpayment", (req, res) => {
    logMessage("Received request to /startpayment endpoint");

    const amount = req.body.amount ? req.body.amount : false;
    if (!amount) {
        logMessage("Error: Amount is not sent");
        return res.status(400).send("Amount is not sent");
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 5 || numAmount > 100) {
        logMessage(`Error: Invalid amount sent: ${amount}`);
        return res.status(400).send("Invalid Amount sent");
    }

    if (!req.body.cardId ? req.body.cardId : false) {
        logMessage("Error: CardId is not sent");
        return res.status(400).send("CardId is not sent");
    }

    const cardId = Number(req.body.cardId);
    if (isNaN(cardId)) {
        logMessage(`Error: Invalid cardId sent: ${cardId}`);
        return res.status(400).send("Invalid cardId sent");
    }


    if (!req.body.userId ? req.body.userId : false) {
        logMessage("Error: userId is not sent");
        return res.status(400).send("userId is not sent");
    }
    const userId = Number(req.body.userId);
    if (isNaN(userId)) {
        logMessage(`Error: Invalid userId sent: ${userId}`);
        return res.status(400).send("Invalid userId sent");
    }
    logMessage(`Starting payment process for amount: ${amount}, CardId: ${cardId}`);

    const process = spawn('./Portalum.Zvt.EasyPay.exe', ['--amount', amount]);

    process.stdout.on('data', (data) => {
        logMessage(`Process stdout: ${data}`);
    });

    process.stderr.on('data', (data) => {
        logMessage(`Process stderr: ${data}`);
    });

    process.on('close', (returnCode) => {
        logMessage(`Process exited with code ${returnCode}`);
        if (returnCode === 0) {
            logMessage("Payment process successful");
            // Construct the external API URL
            const apiUrl = process.env.CONTAINER_API + `/cities/${process.env.CitYID}/store/${process.env.STOREID}/user/${userId}/card/addCredit`;
            const encryptData = encrypt({
                credit: amount,
                cardId: cardId,
                source: StoreCardTransactionEnums.source.card

            },  process.env.REACT_APP_ENCRYPTION_KEY,
            process.env.REACT_APP_ENCRYPTION_IV)
            // Make the PATCH request
            const response = axios.patch(apiUrl, {
                storeData: encryptData
            });
            logMessage(`API response: ${response.data}`);
            res.send("Success");
        } else {
            logMessage(`Payment process failed with status code ${returnCode}`);
            res.status(500).send(`Failed with status code ${returnCode}`);
        }
    });
});

module.exports = router;
