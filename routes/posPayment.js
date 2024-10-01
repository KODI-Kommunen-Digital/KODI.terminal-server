// paymentRoutes.js

const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { encrypt } = require("../utils/AES");

const router = express.Router();

// Directory for logging
const logDir = path.join('logs', 'pos_system');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const StoreCardTransactionEnums = {
    type: {
      debit: 1,
      creditByCash: 2,
      creditByCard: 3,
    },
    source: {
      cash: 1,
      card: 2,
    },
  };
  

// Helper function to log messages
function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, `${timestamp}: ${message}\n`);
}

// Define the /startpayment endpoint
router.get("/startpayment", (req, res) => {
    logMessage("Received request to /startpayment endpoint");

    const amount = req.query.amount ? req.query.amount : false;
    if (!amount) {
        logMessage("Error: Amount is not sent");
        return res.status(400).send("Amount is not sent");
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 5 || numAmount > 100) {
        logMessage(`Error: Invalid amount sent: ${amount}`);
        return res.status(400).send("Invalid Amount sent");
    }

    if (!req.query.cardId ? req.query.cardId : false) {
        logMessage("Error: CardId is not sent");
        return res.status(400).send("CardId is not sent");
    }

    const cardId = Number(req.query.cardId);
    if (isNaN(cardId)) {
        logMessage(`Error: Invalid cardId sent: ${cardId}`);
        return res.status(400).send("Invalid Amount sent");
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
            const apiUrl = `https://test.smartregion-auf.de/containerapi/api/cities/${cityId}/store/${storeId}/user/${userId}/card/addCredit`;
            const encryptData = encrypt({
                credit: amount,
                cardId: cardId,
                source: StoreCardTransactionEnums.source.card

            },  process.env.REACT_APP_ENCRYPTION_KEY,
            process.env.REACT_APP_ENCRYPTION_IV)
            // Make the PATCH request
            const response = axios.patch(apiUrl, {
                creditData: encryptData
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
