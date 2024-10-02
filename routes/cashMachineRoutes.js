const express = require('express');
const router = express.Router();
const cashReader = require('../services/cashReader');
const axios = require('axios');
const { encrypt } = require("../utils/AES");
const StoreCardTransactionEnums = require("../constants/databaseEnums")
require('dotenv').config();

let cashMachineInstance = null;

router.post("/start", async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).send("userId is required");
    }

    if (cashMachineInstance) {
        return res.status(400).send("Cash machine is already running");
    }
    
    try {
        cashMachineInstance = await cashReader.start(userId);
        res.send("Cash machine started successfully");
    } catch (error) {
        console.error("Failed to start cash machine:", error);
        res.status(500).send(`Failed to start cash machine: ${error.message}`);
    }
});

router.post("/stop", async (req, res) => {
    const { userId, cardId } = req.body;

    if (!userId) {
        return res.status(400).send("userId is required");
    }

    if (!cashMachineInstance) {
        return res.status(400).send("Cash machine is not running");
    }
    
    try {
        const cashMachineResponse = await cashMachineInstance.stop(userId);
        
        // Prepare data for the remote API call
        const apiDomain = process.env.CONTAINER_API;
        const storeData = encrypt({
            credit: cashMachineResponse.totalAmount,
            cardId: cardId,
            source: StoreCardTransactionEnums.source.cash

        },  process.env.REACT_APP_ENCRYPTION_KEY,
        process.env.REACT_APP_ENCRYPTION_IV)
        
        // Make the remote API call
        const apiResponse = await axios.patch(
            `${apiDomain}/cities/${process.env.CITYID}/store/${process.env.STOREID}/user/${userId}/card/addCredit`,
            {
                storeData
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                }
            }
        );

        cashMachineInstance = null;

        // Prepare the response
        const response = {
            message: "Cash machine stopped successfully",
            totalAmount: cashMachineResponse.totalAmount,
            noteInventory: cashMachineResponse.inventory,
            apiResponse: apiResponse.data
        };

        res.json(response);
    } catch (error) {
        console.error("Failed to stop cash machine or update credit:", error);
        res.status(500).send(`Failed to stop cash machine or update credit: ${error.message}`);
    }
});

module.exports = router;