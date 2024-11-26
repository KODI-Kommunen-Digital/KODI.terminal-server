const EventEmitter = require('events');
const serialConfig = require('../config/serialConfig');
const sspLib = require('encrypted-smiley-secure-protocol');
const fs = require('fs');
const path = require('path');
const { sendWebhook } = require('../webhook');
const Logger = require('../utils/logger');

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
            { value: 5, label: '5 EUR' },
            { value: 10, label: '10 EUR' },
            { value: 20, label: '20 EUR' },
            { value: 50, label: '50 EUR' },
            { value: 100, label: '100 EUR' },
            { value: 200, label: '200 EUR' },
            { value: 500, label: '500 EUR' }
        ];
        this.inventory = this.euroDenominations.reduce((acc, denom) => {
            acc[denom.label] = 0;
            return acc;
        }, {});
        this.totalAmount = 0;
        this.currentNote = null;
        this.logger = new Logger(path.join(__dirname, '..', 'logs', 'cashMachine'));
        this.currentTransaction = {
            totalAmount: 0,
            notes: {}
        };
        this.isReset = false;
    }

    // Add method to check if enough time has passed since last reset
    canAttemptReset() {
        if (!this.lastResetTime) return true;
        const minTimeBetweenResets = 30000; // 30 seconds
        return Date.now() - this.lastResetTime >= minTimeBetweenResets;
    }

    // Add method for port cleanup
    async cleanupPort() {
        try {
            if (this.eSSP) {
                await this.eSSP.close();
                this.logger.log('Port closed successfully');
            }
            // Wait for OS to fully release the port
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            this.logger.log(`Port cleanup error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    updateInventory(denomination) {
        if (this.inventory.hasOwnProperty(denomination.label)) {
            this.inventory[denomination.label]++;
            this.totalAmount += denomination.value;
            this.logger.log(`Updated inventory: ${denomination.label} added. New count: ${this.inventory[denomination.label]}. Total amount: ${this.totalAmount/100} EUR`);
            
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
            this.logger.log(`Unknown denomination: ${denomination.label}`, 'WARN');
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
                    this.logger.log(`Get denomination route result for ${denom.label}: ${JSON.stringify(result)}`);

                    if (result.status === 'OK') {
                        inventory[denom.label] = result.info.route;
                    } else {
                        this.logger.log(`Failed to get denomination route for ${denom.label}: ${result.status}`, 'WARN');
                        inventory[denom.label] = 'Unknown';
                    }
                } catch (error) {
                    this.logger.log(`Error getting denomination route for ${denom.label}: ${error.message}`, 'ERROR');
                    inventory[denom.label] = 'Error';
                }
            }

            this.logger.log(`Current note inventory: ${JSON.stringify(inventory)}`);
            return inventory;

        } catch (error) {
            this.logger.log(`Error getting note inventory: ${error.message}`, 'ERROR');
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
            this.logger.log(`Set denomination route result for ${value} ${this.countryCode}: ${JSON.stringify(result)}`);

            if (result.status !== 'OK') {
                throw new Error(`Failed to set denomination route for ${value} ${this.countryCode}: ${result.status}`);
            }

            return result;
        } catch (error) {
            this.logger.log(`Error setting denomination route: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async floatAmount(amount) {
        try {
            const result = await this.eSSP.command('FLOAT_AMOUNT', { amount });
            this.logger.log(`Float amount result: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            this.logger.log(`Error floating amount: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async initialize() {
        try {
            // Clean up port first
            await this.cleanupPort();
            // Try to open the port
            await this.eSSP.open(this.port, this.portOptions);
            this.logger.log(`NV200 connected on ${this.port}`);
        } catch (error) {
            this.logger.log(`Initialization error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async enableDevice() {
        try {
            const enableResult = await this.eSSP.command('ENABLE');
            this.logger.log(`Enable result: ${JSON.stringify(enableResult)}`);
        } catch (error) {
            this.logger.log(`Enable error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async getSerialNumber() {
        try {
            const result = await this.eSSP.command('GET_SERIAL_NUMBER');
            this.logger.log(`NV200 Serial number: ${result.info.serial_number}`);
            return result.info.serial_number;
        } catch (error) {
            this.logger.log(`Failed to get serial number: ${error.message}`, 'ERROR');
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
                    this.logger.log(`Unexpected info structure: ${JSON.stringify(pollResult.info)}`, 'WARN');
                }
            }
            
            return pollResult;
        } catch (error) {
            this.logger.log(`Polling error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async payout(amount) {
        try {
            const payoutResult = await this.eSSP.command('PAYOUT_AMOUNT', { amount });
            this.logger.log(`Payout result: ${JSON.stringify(payoutResult)}`);
            return payoutResult;
        } catch (error) {
            this.logger.log(`Payout error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async emptyCashbox() {
        try {
            const emptyResult = await this.eSSP.command('EMPTY_ALL');
            this.logger.log(`Cashbox emptied: ${JSON.stringify(emptyResult)}`);
            return emptyResult;
        } catch (error) {
            this.logger.log(`Empty cashbox error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    handlePollInfo(info) {
        if (!info || !info.name) {
            return;
        }
        this.logger.log(`Handling info: ${info.name}`);
        let data = null;
        switch (info.name) {
            case 'SLAVE_RESET':
                this.logger.log('The device has reset itself.', 'WARN');
                this.handleSlaveReset()
                .then(() => {
                    this.logger.log('Slave reset handled successfully.', 'INFO');
                })
                .catch((error) => {
                    this.logger.log(`Failed to handle slave reset: ${error.message}`, 'ERROR');
                });
                break;
            case 'DISABLED':
                this.logger.log('Device is disabled. Attempting to enable...', 'WARN');
                this.enableDevice();
                break;
            case 'READ_NOTE':
                this.currentNote = info.channel;
                this.logger.log(`Note being read: Channel ${this.currentNote}`);
                break;
            case 'CREDIT_NOTE':
                const denomination = this.euroDenominations[info.channel - 1] || { label: 'Unknown', value: 0 };
                data = denomination;
                this.logger.log(`Bill inserted and credited: ${JSON.stringify(denomination)}`);
                this.updateInventory(denomination);
                this.currentNote = null;
                break;
            case 'NOTE_REJECTING':
                this.logger.log('Note is being rejected', 'WARN');
                break;
            case 'NOTE_REJECTED':
                this.logger.log('Note has been rejected', 'WARN');
                break;
            case 'NOTE_STACKING':
                this.logger.log('Note is being stacked');
                break;
            case 'NOTE_STACKED':
                this.logger.log('Note has been stacked');
                break;
            case 'FRAUD_ATTEMPT':
                this.logger.log('Fraud attempt detected', 'ERROR');
                break;
            case 'STACKER_FULL':
                this.logger.log('Stacker is full', 'WARN');
                break;
            case 'CASH_BOX_REMOVED':
                this.logger.log('Cash box has been removed', 'WARN');
                break;
            case 'CASH_BOX_REPLACED':
                this.logger.log('Cash box has been replaced');
                break;
            case 'NOTE_STORED_IN_PAYOUT':
                this.logger.log('Note stored in payout device');
                break;
            case 'NOTE_DISPENSING':
                this.logger.log('Note is being dispensed');
                break;
            case 'NOTE_DISPENSED':
                this.logger.log('Note has been dispensed');
                break;
            case 'NOTE_TRANSFERRED_TO_STACKER':
                this.logger.log('Note transferred to stacker');
                break;
            case 'SMART_EMPTYING':
                this.logger.log('Smart emptying in progress');
                break;
            case 'SMART_EMPTIED':
                this.logger.log('Smart emptying completed');
                break;
            case 'CHANNEL_DISABLE':
                this.logger.log(`Channel disabled: ${info.description}`, 'WARN');
                break;
            case 'CHANNEL_ENABLE':
                this.logger.log(`Channel ${info.channel} enabled`);
                break;
            case 'INITIALISING':
                this.logger.log('Device is initializing');
                break;
            case 'COIN_MECH_ERROR':
                this.logger.log('Coin mechanism error', 'ERROR');
                break;
            case 'COIN_MECH_JAM':
                this.logger.log('Coin mechanism jam', 'ERROR');
                break;
            case 'BARCODE_TICKET_VALIDATED':
                this.logger.log('Barcode ticket validated');
                break;
            case 'BARCODE_TICKET_ACKNOWLEDGE':
                this.logger.log('Barcode ticket acknowledged');
                break;
            case 'SAFE_JAM':
                this.logger.log('Safe jam detected', 'ERROR');
                break;
            case 'UNSAFE_JAM':
                this.logger.log('Unsafe jam detected', 'ERROR');
                break;
            case 'ERROR':
                this.logger.log(`Generic error occurred: ${JSON.stringify(info.data)}`, 'ERROR');
                break;
            default:
                this.logger.log(`Unhandled info: ${info.name}`, 'WARN');
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
            this.logger.log(`Webhook sent successfully for event: ${info.name}`);
        } catch (error) {
            this.logger.log(`Error sending webhook for event: ${info.name} - ${error.message}`, 'ERROR');
        }
    }

    async initializeAndStart(maxRetries = 3, retryDelay = 2000, isReset = false) {
        let attempts = 0;
        let started = false;

        while (attempts < maxRetries && !started) {
            try {
                await this.initialize();
                await this.enableDevice();

                // Add a longer delay for reset scenarios
                const waitTime = isReset ? 3000 : 2000;
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // Test if the device is responsive
                const pollResult = await this.pollDevice();
                if (pollResult.status === 'OK') {
                    started = true;
                    this.logger.log(
                        `Cash machine ${isReset ? 'restarted' : 'started'} successfully by user: ${this.userId}`,
                        'INFO'
                    );
                } else {
                    throw new Error('Device not responsive after initialization');
                }
            } catch (error) {
                attempts++;
                this.logger.log(`${isReset ? 'Reinitialization' : 'Start'} attempt ${attempts} failed: ${error.message}`, 'WARN');
                if (attempts < maxRetries) {
                    // Use exponential backoff for retry delays
                    const currentDelay = retryDelay * Math.pow(2, attempts - 1);
                    this.logger.log(`Retrying in ${currentDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                }
            }
        }

        if (!started) {
            const errorMessage = `Failed to ${isReset ? 'reinitialize' : 'start'} cash machine after ${maxRetries} attempts`;
            this.logger.log(errorMessage, 'ERROR');
            throw new Error(errorMessage);
        }

        this.setupPolling();
    }

    async start() {
        this.isReset = false; // Resetting is false for a normal start
        return this.initializeAndStart();
    }

    async handleSlaveReset() {
        if (!this.canAttemptReset()) {
            this.logger.log('Reset attempted too soon after previous reset', 'WARN');
            return;
        }

        this.isReset = true;
        this.lastResetTime = Date.now();
        this.resetAttempts++;

        try {
            // First, try to disable the device gracefully
            await this.eSSP.command('DISABLE').catch(() => {});
            
            // Clean up port and wait
            await this.cleanupPort();
            
            // Wait for device to stabilize - longer delay for more reset attempts
            const stabilizationDelay = Math.min(5000 * this.resetAttempts, 20000);
            this.logger.log(`Waiting ${stabilizationDelay}ms for device to stabilize...`);
            await new Promise(resolve => setTimeout(resolve, stabilizationDelay));

            // Attempt reinitialization with exponential backoff
            await this.initializeAndStart(3, 5000, true);
            
            this.resetAttempts = 0;
            this.logger.log('Slave reset handled successfully', 'INFO');
        } catch (error) {
            this.logger.log(`Failed to handle slave reset: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    setupPolling() {
        this.pollInterval = setInterval(async () => {
            try {
                await this.pollDevice();
            } catch (error) {
                this.logger.log(`Error during polling: ${error.message}`, 'ERROR');
            }
        }, 1000);
    }

    async stop() {
        clearInterval(this.pollInterval);
        try {
            // Try to disable device gracefully before closing
            await this.eSSP.command('DISABLE').catch(() => {});
            await this.cleanupPort();
            
            this.logger.log(`NV200 stopped by user: ${this.userId}`);
            // Send final transaction webhook
            await this.sendWebhookForInfo({ name: 'TRANSACTION_COMPLETED' }, this.currentTransaction);
            return { totalAmount: this.totalAmount, inventory: this.inventory };
        } catch (error) {
            this.logger.log(`Error stopping NV200: ${error.message}`, 'ERROR');
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