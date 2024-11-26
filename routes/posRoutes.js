const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const { encrypt } = require("../utils/AES");
const axios = require('axios');
const StoreCardTransactionEnums = require("../constants/databaseEnums");
const Logger = require("../utils/Logger");
const env = require('dotenv').config().parsed;

const router = express.Router();

// Initialize the logger
const logDir = path.join(__dirname, '..', 'logs', 'posSystem');
const logger = new Logger(logDir);

// Define the /startpayment endpoint
router.post("/startpayment", (req, res) => {
    logger.log("Received request to /startpayment endpoint");

    const amount = req.body.amount ? req.body.amount : false;
    if (!amount) {
        logger.log("Amount is not sent", "ERROR");
        return res.status(400).send("Amount is not sent");
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 5 || numAmount > 100) {
        logger.log(`Invalid amount sent: ${amount}`, "ERROR");
        return res.status(400).send("Invalid Amount sent");
    }

    if (!req.body.cardId ? req.body.cardId : false) {
        logger.log("CardId is not sent", "ERROR");
        return res.status(400).send("CardId is not sent");
    }

    const cardId = Number(req.body.cardId);
    if (isNaN(cardId)) {
        logger.log(`Invalid cardId sent: ${cardId}`, "ERROR");
        return res.status(400).send("Invalid cardId sent");
    }

    if (!req.body.userId ? req.body.userId : false) {
        logger.log("userId is not sent", "ERROR");
        return res.status(400).send("userId is not sent");
    }
    const userId = Number(req.body.userId);
    if (isNaN(userId)) {
        logger.log(`Invalid userId sent: ${userId}`, "ERROR");
        return res.status(400).send("Invalid userId sent");
    }

    logger.log(`Starting payment process for Amount: ${amount}, CardId: ${cardId}, UserId: ${userId}`);

    const process = spawn('./Portalum.Zvt.EasyPay.exe', ['--amount', amount, '--no-ui']);

    process.stdout.on('data', (data) => {
        logger.log(`Process stdout: ${data}`);
    });

    process.stderr.on('data', (data) => {
        logger.log(`Process stderr: ${data}`, "ERROR");
    });

    process.on('close', async (returnCode) => {
        logger.log(`Process exited with code ${returnCode}`);
        if (returnCode == 0) {
            logger.log("Payment process successful");
            // Construct the external API URL
            const apiUrl = env.CONTAINER_API + `/cities/${env.CITYID}/store/${env.STOREID}/user/${userId}/card/addCredit`;
            const encryptData = encrypt(
                JSON.stringify({
                    credit: amount,
                    cardId: cardId,
                    source: StoreCardTransactionEnums.source.card
                }),
                env.REACT_APP_ENCRYPTION_KEY,
                env.REACT_APP_ENCRYPTION_IV
            );
            
            // Make the PATCH request
            try {
                const response = await axios.patch(apiUrl, {
                    storeData: encryptData
                });
                logger.log(`API response: ${JSON.stringify(response.data)}`);
                res.send("Success");
            } catch (error) {
                logger.log(`API Error: ${error}`, "ERROR");
                res.status(400).send("Failed");
            }
            
        } else {
            logger.log(`Payment process failed with status code ${returnCode}`, "ERROR");
            res.status(500).send(`Failed with status code ${returnCode}`);
        }
    });
});

module.exports = router;
