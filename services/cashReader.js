const EventEmitter = require('events');
const serialConfig = require('../config/serialConfig');
const sspLib = require('encrypted-smiley-secure-protocol');
const fs = require('fs');
const path = require('path');
const { sendWebhook } = require('../webhook');

class NV200CashMachine {
    constructor(port, baudRate, debug, countryCode, userId) {
        this.eSSP = new sspLib({
            id: 0x00,
            fixedKey: '0123456701234567',
            timeout: 3000,
            debug,
            encryptAllCommand: false
        });
        this.portOptions = { baudRate };
        this.port = port;
        this.countryCode = countryCode;
        this.userId = userId;
        this.euroDenominations = [
            { value: 500, label: '5 EUR' },
            { value: 1000, label: '10 EUR' },
            { value: 2000, label: '20 EUR' },
            { value: 5000, label: '50 EUR' },
            { value: 10000, label: '100 EUR' },
            { value: 20000, label: '200 EUR' },
            { value: 50000, label: '500 EUR' }
        ];
        this.inventory = this.euroDenominations.reduce((acc, denom) => {
            acc[denom.label] = 0;
            return acc;
        }, {});
        this.totalAmount = 0;
        this.currentNote = null;
        this.logDir = path.join(__dirname, '..', 'logs', 'cashMachine');
        this.ensureLogDirectory();
        this.currentTransaction = {
            totalAmount: 0,
            notes: {}
        };
        this.isReset = false;
    }

    updateInventory(denomination) {
        if (this.inventory.hasOwnProperty(denomination.label)) {
            this.inventory[denomination.label]++;
            this.totalAmount += denomination.value;
            this.log(`Updated inventory: ${denomination.label} added. New count: ${this.inventory[denomination.label]}. Total amount: ${this.totalAmount/100} EUR`);
            
            // Update currentTransaction
            this.currentTransaction.totalAmount += denomination.value;
            if (this.currentTransaction.notes[denomination.label]) {
                this.currentTransaction.notes[denomination.label].count++;
            } else {
                this.currentTransaction.notes[denomination.label] = {
                    count: 1,
                    value: denomination.value
                };
            }
        } else {
            this.log(`Unknown denomination: ${denomination.label}`, 'WARN');
        }
    }

    async getNoteInventory() {
        try {
            const inventory = {};
            for (const denom of this.euroDenominations) {
                try {
                    const result = await this.eSSP.command('GET_DENOMINATION_ROUTE', {
                        isHopper: false,
                        value: denom.value,
                        country_code: this.countryCode
                    });
                    this.log(`Get denomination route result for ${denom.label}: ${JSON.stringify(result)}`);

                    if (result.status === 'OK') {
                        inventory[denom.label] = result.info.route;
                    } else {
                        this.log(`Failed to get denomination route for ${denom.label}: ${result.status}`, 'WARN');
                        inventory[denom.label] = 'Unknown';
                    }
                } catch (error) {
                    this.log(`Error getting denomination route for ${denom.label}: ${error.message}`, 'ERROR');
                    inventory[denom.label] = 'Error';
                }
            }

            this.log(`Current note inventory: ${JSON.stringify(inventory)}`);
            return inventory;

        } catch (error) {
            this.log(`Error getting note inventory: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async setDenominationRoute(value, route) {
        try {
            const result = await this.eSSP.command('SET_DENOMINATION_ROUTE', {
                route: route, // 'payout' or 'cashbox'
                value: value,
                country_code: this.countryCode,
            });
            this.log(`Set denomination route result for ${value} ${this.countryCode}: ${JSON.stringify(result)}`);

            if (result.status !== 'OK') {
                throw new Error(`Failed to set denomination route for ${value} ${this.countryCode}: ${result.status}`);
            }

            return result;
        } catch (error) {
            this.log(`Error setting denomination route: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async floatAmount(amount) {
        try {
            const result = await this.eSSP.command('FLOAT_AMOUNT', { amount });
            this.log(`Float amount result: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            this.log(`Error floating amount: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    getLogFilename() {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = now.toLocaleString('default', { month: 'short' }).toUpperCase();
        const year = now.getFullYear();
        return path.join(this.logDir, `${day}${month}${year}.log`);
    }

    log(message, severity = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} - ${severity}: ${message}\n`;
        const logFile = this.getLogFilename();
        fs.appendFile(logFile, logMessage, (err) => {
            if (err) console.error('Error writing to log file:', err);
        });
        console.log(logMessage);
    }

    async initialize() {
        try {
            await this.eSSP.open(this.port, this.portOptions);
            this.log(`NV200 connected on ${this.port}`);
        } catch (error) {
            this.log(`Initialization error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async enableDevice() {
        try {
            const enableResult = await this.eSSP.command('ENABLE');
            this.log(`Enable result: ${JSON.stringify(enableResult)}`);
        } catch (error) {
            this.log(`Enable error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async getSerialNumber() {
        try {
            const result = await this.eSSP.command('GET_SERIAL_NUMBER');
            this.log(`NV200 Serial number: ${result.info.serial_number}`);
            return result.info.serial_number;
        } catch (error) {
            this.log(`Failed to get serial number: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async pollDevice() {
        try {
            const pollResult = await this.eSSP.command('POLL');

            if (pollResult.info) {
                if (Array.isArray(pollResult.info)) {
                    pollResult.info.forEach(info => this.handlePollInfo(info));
                } else if (typeof pollResult.info === 'object') {
                    this.handlePollInfo(pollResult.info);
                } else {
                    this.log(`Unexpected info structure: ${JSON.stringify(pollResult.info)}`, 'WARN');
                }
            }
            
            return pollResult;
        } catch (error) {
            this.log(`Polling error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async payout(amount) {
        try {
            const payoutResult = await this.eSSP.command('PAYOUT_AMOUNT', { amount });
            this.log(`Payout result: ${JSON.stringify(payoutResult)}`);
            return payoutResult;
        } catch (error) {
            this.log(`Payout error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async emptyCashbox() {
        try {
            const emptyResult = await this.eSSP.command('EMPTY_ALL');
            this.log(`Cashbox emptied: ${JSON.stringify(emptyResult)}`);
            return emptyResult;
        } catch (error) {
            this.log(`Empty cashbox error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    handlePollInfo(info) {
        if (!info || !info.name) {
            return;
        }
        this.log(`Handling info: ${info.name}`);
        let data = null;
        switch (info.name) {
            case 'SLAVE_RESET':
                this.log('The device has reset itself.', 'WARN');
                this.handleSlaveReset()
                .then(() => {
                    this.log('Slave reset handled successfully.', 'INFO');
                })
                .catch((error) => {
                    this.log(`Failed to handle slave reset: ${error.message}`, 'ERROR');
                });
                break;
            case 'DISABLED':
                this.log('Device is disabled. Attempting to enable...', 'WARN');
                this.enableDevice();
                break;
            case 'READ_NOTE':
                this.currentNote = info.channel;
                this.log(`Note being read: Channel ${this.currentNote}`);
                break;
            case 'CREDIT_NOTE':
                const denomination = this.euroDenominations[info.channel - 1] || { label: 'Unknown', value: 0 };
                data = denomination;
                this.log(`Bill inserted and credited: ${JSON.stringify(denomination)}`);
                this.updateInventory(denomination);
                this.currentNote = null;
                break;
            case 'NOTE_REJECTING':
                this.log('Note is being rejected', 'WARN');
                break;
            case 'NOTE_REJECTED':
                this.log('Note has been rejected', 'WARN');
                break;
            case 'NOTE_STACKING':
                this.log('Note is being stacked');
                break;
            case 'NOTE_STACKED':
                this.log('Note has been stacked');
                break;
            case 'FRAUD_ATTEMPT':
                this.log('Fraud attempt detected', 'ERROR');
                break;
            case 'STACKER_FULL':
                this.log('Stacker is full', 'WARN');
                break;
            case 'CASH_BOX_REMOVED':
                this.log('Cash box has been removed', 'WARN');
                break;
            case 'CASH_BOX_REPLACED':
                this.log('Cash box has been replaced');
                break;
            case 'NOTE_STORED_IN_PAYOUT':
                this.log('Note stored in payout device');
                break;
            case 'NOTE_DISPENSING':
                this.log('Note is being dispensed');
                break;
            case 'NOTE_DISPENSED':
                this.log('Note has been dispensed');
                break;
            case 'NOTE_TRANSFERRED_TO_STACKER':
                this.log('Note transferred to stacker');
                break;
            case 'SMART_EMPTYING':
                this.log('Smart emptying in progress');
                break;
            case 'SMART_EMPTIED':
                this.log('Smart emptying completed');
                break;
            case 'CHANNEL_DISABLE':
                this.log(`Channel disabled: ${info.description}`, 'WARN');
                break;
            case 'CHANNEL_ENABLE':
                this.log(`Channel ${info.channel} enabled`);
                break;
            case 'INITIALISING':
                this.log('Device is initializing');
                break;
            case 'COIN_MECH_ERROR':
                this.log('Coin mechanism error', 'ERROR');
                break;
            case 'COIN_MECH_JAM':
                this.log('Coin mechanism jam', 'ERROR');
                break;
            case 'BARCODE_TICKET_VALIDATED':
                this.log('Barcode ticket validated');
                break;
            case 'BARCODE_TICKET_ACKNOWLEDGE':
                this.log('Barcode ticket acknowledged');
                break;
            case 'SAFE_JAM':
                this.log('Safe jam detected', 'ERROR');
                break;
            case 'UNSAFE_JAM':
                this.log('Unsafe jam detected', 'ERROR');
                break;
            case 'ERROR':
                this.log(`Generic error occurred: ${JSON.stringify(info.data)}`, 'ERROR');
                break;
            default:
                this.log(`Unhandled info: ${info.name}`, 'WARN');
        }
        this.sendWebhookForInfo(info, data);
    }

    async sendWebhookForInfo(info, data = null) {
        const eventData = { ...info };

        if (data) {
            eventData.data = data;
        }

        try {
            await sendWebhook(eventData, 'cashreader');
            this.log(`Webhook sent successfully for event: ${info.name}`);
        } catch (error) {
            this.log(`Error sending webhook for event: ${info.name} - ${error.message}`, 'ERROR');
        }
    }

    async initializeAndStart(maxRetries = 3, retryDelay = 2000, isReset = false) {
        let attempts = 0;
        let started = false;

        while (attempts < maxRetries && !started) {
            try {
                await this.initialize(); // Reinitialize the device
                await this.enableDevice(); // Enable it for use

                // Add a short delay to ensure the device is ready
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Test if the device is responsive
                const pollResult = await this.pollDevice();
                if (pollResult.status === 'OK') {
                    started = true;
                    this.log(
                        `Cash machine ${isReset ? 'restarted' : 'started'} successfully by user: ${this.userId}`,
                        'INFO'
                    );
                } else {
                    throw new Error('Device not responsive after initialization');
                }
            } catch (error) {
                attempts++;
                this.log(`${isReset ? 'Reinitialization' : 'Start'} attempt ${attempts} failed: ${error.message}`, 'WARN');
                if (attempts < maxRetries) {
                    this.log(`Retrying in ${retryDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        if (!started) {
            const errorMessage = `Failed to ${isReset ? 'reinitialize' : 'start'} cash machine after ${maxRetries} attempts`;
            this.log(errorMessage, 'ERROR');
            throw new Error(errorMessage);
        }

        // Only set up polling if the machine started successfully
        this.setupPolling();
    }

    async start() {
        this.isReset = false; // Resetting is false for a normal start
        return this.initializeAndStart();
    }

    async handleSlaveReset() {
        this.isReset = true; // Indicate that it's a reset operation
        try {
            await this.initializeAndStart(3, 2000, true);
            this.log('Slave reset handled successfully', 'INFO');
        } catch (error) {
            this.log(`Failed to handle slave reset: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    setupPolling() {
        this.pollInterval = setInterval(async () => {
            try {
                await this.pollDevice();
            } catch (error) {
                this.log(`Error during polling: ${error.message}`, 'ERROR');
            }
        }, 1000);
    }

    async stop() {
        clearInterval(this.pollInterval);
        try {
            await this.eSSP.close();
            this.log(`NV200 stopped by user: ${this.userId}`);
            // Send final transaction webhook
            await this.sendWebhookForInfo({ name: 'TRANSACTION_COMPLETED' }, this.currentTransaction);
            return { totalAmount: this.totalAmount, inventory: this.inventory };
        } catch (error) {
            this.log(`Error stopping NV200: ${error.message}`, 'ERROR');
            throw error;
        }
    }
}

module.exports = {
    start: async function(userId) {
        const nv200 = new NV200CashMachine(serialConfig.port, serialConfig.baudRate, false, 'EUR', userId);
        try {
            await nv200.start();
            return nv200;
        } catch (error) {
            console.error('Failed to start NV200:', error);
            throw error;
        }
    }
};