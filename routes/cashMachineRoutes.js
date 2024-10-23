const express = require('express');
const router = express.Router();
const cashReader = require('../services/cashReader');
const axios = require('axios');
const { encrypt } = require("../utils/AES");
const StoreCardTransactionEnums = require("../constants/databaseEnums")
require('dotenv').config();

let cashMachineInstance = null;
let startingMachine = false;

router.post("/start", async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            status: 'error',
            message: "userId is required"
        });
    }

    // If the machine is already starting, return a "please wait" response
    if (startingMachine) {
        return res.status(202).json({
            status: 'pending',
            message: "Cash machine is currently starting. Please wait and try again.",
            machineStatus: 'starting'
        });
    }

    // If the machine is already running, check its status
    if (cashMachineInstance) {
        try {
            const pollResult = await cashMachineInstance.pollDevice();
            if (pollResult.status === 'OK') {
                return res.status(200).json({
                    status: 'success',
                    message: "Cash machine is already running",
                    machineStatus: 'running'
                });
            } else {
                // If poll fails, reset the instance
                cashMachineInstance = null;
            }
        } catch (error) {
            // If polling throws an error, reset the instance
            cashMachineInstance = null;
        }
    }

    // At this point, either cashMachineInstance was null or it was reset due to an error
    startingMachine = true;
    try {
        cashMachineInstance = await cashReader.start(userId);
        startingMachine = false;
        res.status(200).json({
            status: 'success',
            message: "Cash machine started successfully",
            machineStatus: 'started'
        });
    } catch (error) {
        console.error("Failed to start cash machine:", error);
        cashMachineInstance = null;
        startingMachine = false;
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
        // Stop the cash machine
        const cashMachineResponse = await cashMachineInstance.stop(userId);

        // If the total amount is 0, just stop the machine and return a success response
        if (cashMachineResponse.totalAmount === 0) {
            cashMachineInstance = null;
            return res.status(200).json({
                message: "Cash machine stopped successfully, but no amount was credited",
                totalAmount: cashMachineResponse.totalAmount,
                noteInventory: cashMachineResponse.inventory,
                apiResponse: null // No API call made
            });
        }

        // If the amount is not 0, proceed with the API call
        const apiDomain = process.env.CONTAINER_API;
        const storeData = encrypt(
            JSON.stringify({
                credit: cashMachineResponse.totalAmount,
                cardId: cardId,
                source: StoreCardTransactionEnums.source.cash
            }),
            process.env.REACT_APP_ENCRYPTION_KEY,
            process.env.REACT_APP_ENCRYPTION_IV
        );

        // Make the remote API call to update the credit
        const apiResponse = await axios.patch(
            `${apiDomain}/cities/${process.env.CITYID}/store/${process.env.STOREID}/user/${userId}/card/addCredit`,
            { storeData },
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