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
        return res.status(400).json({
            status: 'error',
            message: "userId is required"
        });
    }

    if (cashMachineInstance) {
        // Check if the machine is actually running
        try {
            const pollResult = await cashMachineInstance.pollDevice();
            if (pollResult.status === 'OK') {
                return res.status(200).json({
                    status: 'success',
                    message: "Cash machine is already running",
                    machineStatus: 'running'
                });
            } else {
                // If poll fails, the machine might be in an error state
                cashMachineInstance = null; // Reset the instance
            }
        } catch (error) {
            // If polling throws an error, the machine is not responsive
            cashMachineInstance = null; // Reset the instance
        }
    }

    // At this point, either cashMachineInstance was null or it was reset due to an error
    try {
        cashMachineInstance = await cashReader.start(userId);
        res.status(200).json({
            status: 'success',
            message: "Cash machine started successfully",
            machineStatus: 'started'
        });
    } catch (error) {
        console.error("Failed to start cash machine:", error);
        res.status(500).json({
            status: 'error',
            message: `Failed to start cash machine: ${error.message}`,
            machineStatus: 'error'
        });
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
        const storeData = encrypt(
        JSON.stringify({
            credit: cashMachineResponse.totalAmount,
            cardId: cardId,
            source: StoreCardTransactionEnums.source.cash

        }),
        process.env.REACT_APP_ENCRYPTION_KEY,
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