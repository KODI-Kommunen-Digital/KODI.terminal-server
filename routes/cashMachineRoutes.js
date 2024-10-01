const express = require('express');
const router = express.Router();
const cashReader = require('../services/cashReader');

let cashMachineInstance = null;

router.post("/start", async (req, res) => {
    if (cashMachineInstance) {
        return res.status(400).send("Cash machine is already running");
    }
    
    try {
        cashMachineInstance = await cashReader.start();
        res.send("Cash machine started successfully");
    } catch (error) {
        console.error("Failed to start cash machine:", error);
        res.status(500).send(`Failed to start cash machine: ${error.message}`);
    }
});

router.post("/stop", async (req, res) => {
    if (!cashMachineInstance) {
        return res.status(400).send("Cash machine is not running");
    }
    
    try {
        await cashMachineInstance.stop();
        cashMachineInstance = null;
        res.send("Cash machine stopped successfully");
    } catch (error) {
        console.error("Failed to stop cash machine:", error);
        res.status(500).send(`Failed to stop cash machine: ${error.message}`);
    }
});

module.exports = router;