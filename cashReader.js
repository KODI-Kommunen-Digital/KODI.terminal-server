const EventEmitter = require('events');
const serialConfig = require('./config/serialConfig');
const sspLib = require('encrypted-smiley-secure-protocol');
const fs = require('fs');
const path = require('path');
const { sendWebhook } = require('./webhook');

class NV200CashMachine extends EventEmitter {
    constructor(port = serialConfig.port, baudRate = serialConfig.baudRate, debug = false, countryCode = 'EUR') {
        super();
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
        this.euroDenominations = {
            500: '5 EUR',
            1000: '10 EUR',
            2000: '20 EUR',
            5000: '50 EUR',
            10000: '100 EUR',
            20000: '200 EUR',
            50000: '500 EUR'
        };
        this.currentNote = null;
        this.logDir = path.join(__dirname, 'logs/cashMachine');
        this.ensureLogDirectory();
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
                        this.log(`Failed to get denomination route for ${denom.label}: ${result.status}`);
                        inventory[denom.label] = 'Unknown';
                    }
                } catch (error) {
                    this.log(`Error getting denomination route for ${denom.label}: ${error.message}`);
                    inventory[denom.label] = 'Error';
                }
            }

            this.log(`Current note inventory: ${JSON.stringify(inventory)}`);
            return inventory;

        } catch (error) {
            this.log(`Error getting note inventory: ${error.message}`);
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
            this.log(`Error setting denomination route: ${error.message}`);
            throw error;
        }
    }

    async floatAmount(amount) {
        try {
            const result = await this.eSSP.command('FLOAT_AMOUNT', { amount });
            this.log(`Float amount result: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            this.log(`Error floating amount: ${error.message}`);
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

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} - ${message}\n`;
        const logFile = this.getLogFilename();
        fs.appendFile(logFile, logMessage, (err) => {
            if (err) console.error('Error writing to log file:', err);
        });
        console.log(message);
    }

    async initialize() {
        try {
            await this.eSSP.open(this.port, this.portOptions);
            this.log(`NV200 connected on ${this.port}`);
            
            this.log('Encryption initialized.');
        } catch (error) {
            this.log(`Initialization error: ${error.message}`);
            throw error;
        }
    }

    async enableDevice() {
        try {
            const enableResult = await this.eSSP.command('ENABLE');
            this.log(`Enable result: ${JSON.stringify(enableResult)}`);
        } catch (error) {
            this.log(`Enable error: ${error.message}`);
            throw error;
        }
    }

    async getSerialNumber() {
        try {
            const result = await this.eSSP.command('GET_SERIAL_NUMBER');
            this.log(`NV200 Serial number: ${result.info.serial_number}`);
            return result.info.serial_number;
        } catch (error) {
            this.log(`Failed to get serial number: ${error.message}`);
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
                    this.log(`Unexpected info structure: ${JSON.stringify(pollResult.info)}`);
                }
            }
            
            return pollResult;
        } catch (error) {
            this.log(`Polling error: ${error.message}`);
            throw error;
        }
    }

    async payout(amount) {
        try {
            const payoutResult = await this.eSSP.command('PAYOUT_AMOUNT', { amount });
            this.log(`Payout result: ${JSON.stringify(payoutResult)}`);
            return payoutResult;
        } catch (error) {
            this.log(`Payout error: ${error.message}`);
            throw error;
        }
    }

    async emptyCashbox() {
        try {
            const emptyResult = await this.eSSP.command('EMPTY_ALL');
            this.log(`Cashbox emptied: ${JSON.stringify(emptyResult)}`);
            return emptyResult;
        } catch (error) {
            this.log(`Empty cashbox error: ${error.message}`);
            throw error;
        }
    }

    async start() {
        await this.initialize();
        await this.enableDevice();
        this.pollInterval = setInterval(async () => {
            try {
                await this.pollDevice();
            } catch (error) {
                this.log(`Error during polling: ${error.message}`);
            }
        }, 1000);
    }

    async stop() {
        clearInterval(this.pollInterval);
        try {
            await this.eSSP.close();
            this.log('NV200 stopped.');
        } catch (error) {
            this.log(`Error stopping NV200: ${error.message}`);
        }
    }

    handlePollInfo2(info) {
        if (!info || !info.name) {
            // Skip logging for undefined or empty info
            return;
        }
        this.log(`Handling info: ${info.name}`);
        switch (info.name) {
            case 'SLAVE_RESET':
                this.log('The device has reset itself.');
                this.emit('deviceReset');
                break;
            case 'DISABLED':
                this.log('Device is disabled. Attempting to enable...');
                this.enableDevice();
                break;
            case 'READ_NOTE':
                this.currentNote = info.channel;
                this.log(`Note being read: Channel ${this.currentNote}`);
                break;
            case 'CREDIT_NOTE':
                const denomination = this.euroDenominations[info.channel] || 'Unknown';
                this.log(`Bill inserted and credited: ${denomination}`);
                this.emit('billInserted', { denomination, channel: info.channel });
                this.currentNote = null;
                break;
            case 'NOTE_REJECTING':
                this.log('Note is being rejected');
                break;
            case 'NOTE_REJECTED':
                this.log('Note has been rejected');
                this.emit('noteRejected');
                break;
            case 'NOTE_STACKING':
                this.log('Note is being stacked');
                break;
            case 'NOTE_STACKED':
                this.log('Note has been stacked');
                break;
            case 'FRAUD_ATTEMPT':
                this.log('Fraud attempt detected');
                this.emit('fraudAttempt');
                break;
            case 'STACKER_FULL':
                this.log('Stacker is full');
                this.emit('stackerFull');
                break;
            case 'CASH_BOX_REMOVED':
                this.log('Cash box has been removed');
                this.emit('cashBoxRemoved');
                break;
            case 'CASH_BOX_REPLACED':
                this.log('Cash box has been replaced');
                this.emit('cashBoxReplaced');
                break;
            case 'NOTE_STORED_IN_PAYOUT':
                this.log('Note stored in payout device');
                break;
            case 'NOTE_DISPENSING':
                this.log('Note is being dispensed');
                break;
            case 'NOTE_DISPENSED':
                this.log('Note has been dispensed');
                this.emit('noteDispensed');
                break;
            case 'NOTE_TRANSFERRED_TO_STACKER':
                this.log('Note transferred to stacker');
                break;
            case 'SMART_EMPTYING':
                this.log('Smart emptying in progress');
                break;
            case 'SMART_EMPTIED':
                this.log('Smart emptying completed');
                this.emit('smartEmptied');
                break;
            case 'CHANNEL_DISABLE':
                this.log(`Channel ${info.channel} disabled`);
                break;
            case 'CHANNEL_ENABLE':
                this.log(`Channel ${info.channel} enabled`);
                break;
            case 'INITIALISING':
                this.log('Device is initializing');
                break;
            case 'COIN_MECH_ERROR':
                this.log('Coin mechanism error');
                this.emit('coinMechError');
                break;
            case 'COIN_MECH_JAM':
                this.log('Coin mechanism jam');
                this.emit('coinMechJam');
                break;
            case 'BARCODE_TICKET_VALIDATED':
                this.log('Barcode ticket validated');
                this.emit('barcodeValidated', info.data);
                break;
            case 'BARCODE_TICKET_ACKNOWLEDGE':
                this.log('Barcode ticket acknowledged');
                break;
            case 'SAFE_JAM':
                this.log('Safe jam detected');
                this.emit('safeJam');
                break;
            case 'UNSAFE_JAM':
                this.log('Unsafe jam detected');
                this.emit('unsafeJam');
                break;
            case 'ERROR':
                this.log(`Generic error occurred: ${JSON.stringify(info.data)}`);
                this.emit('error', info.data);
                break;
            default:
                this.log(`Unhandled info: ${info.name}`);
                this.emit('unknownEvent', info);
        }
    }

    handlePollInfo(info) {
        if (!info || !info.name) return; // Skip logging for undefined or empty info
    
        this.log(`Handling info: ${info.name}`);
        
        // Send webhook without emitting events
        this.sendWebhookForInfo(info);
    }
    
    async sendWebhookForInfo(info) {
        const eventData = { type: info.name, ...info };
        try {
            await sendWebhook(eventData, 'cash_reader');
            this.log(`Webhook sent successfully for event: ${info.name}`);
        } catch (error) {
            this.log(`Error sending webhook for event: ${info.name} - ${error.message}`);
        }
    }

    async start() {
        try {
            await this.initialize();
            await this.enableDevice();
            
            // Add a short delay to ensure the device is ready
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                const inventory = await this.getNoteInventory();
                console.log('Current note inventory:');
                for (const [denomination, route] of Object.entries(inventory)) {
                    console.log(`${denomination}: ${route}`);
                }
            } catch (inventoryError) {
                this.log(`Error getting note inventory: ${inventoryError.message}`);
                console.error('Failed to get note inventory, but continuing with startup');
            }

            this.pollInterval = setInterval(async () => {
                try {
                    await this.pollDevice();
                } catch (error) {
                    this.log(`Error during polling: ${error.message}`);
                }
            }, 1000);

            return this;
        } catch (error) {
            this.log(`Error during start: ${error.message}`);
            throw error;
        }
    }
}

module.exports = {
    start: async function(port, baudRate, debug = false, countryCode = 'EUR') {
        const nv200 = new NV200CashMachine(port, baudRate, debug, countryCode);
        try {
            await nv200.start();
            return nv200;
        } catch (error) {
            console.error('Failed to start NV200:', error);
            throw error;
        }
    }
};