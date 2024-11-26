const fs = require('fs');
const path = require('path');
const axios = require('axios');

class Logger {
    constructor(logDir) {
        this.logDir = logDir;
        this.ensureLogDirectory();
        this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
        this.storeName = process.env.STOREID || 'Unknown Store';
        
        // Determine device type from logDir
        this.deviceType = this.getDeviceTypeFromLogDir();
    }

    getDeviceTypeFromLogDir() {
        const dirName = path.basename(this.logDir).toLowerCase();
        if (dirName.includes('nfc')) return 'NFC Reader';
        if (dirName.includes('cash')) return 'Cash Machine';
        return 'Unknown Device';
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

    getStackTrace() {
        const stack = new Error().stack;
        // Remove the first two lines (Error and getStackTrace call)
        const relevantStack = stack
            .split('\n')
            .slice(2)
            .map(line => line.trim())
            .join('\n');
        return relevantStack;
    }

    formatErrorMessage(message, stack) {
        return [
            '**Error Message:**',
            message,
            '',
            '**Stack Trace:**',
            '```',
            stack,
            '```'
        ].join('\n');
    }

    sendDiscordWebhook(message) {
        // Fire and forget - don't use async/await here
        Promise.resolve().then(async () => {
            try {
                if (!this.discordWebhookUrl) {
                    console.error('Discord webhook URL not configured');
                    return;
                }

                const stackTrace = this.getStackTrace();
                const formattedMessage = this.formatErrorMessage(message, stackTrace);

                const payload = {
                    embeds: [{
                        title: `🚨 ${this.deviceType} Failed - ${this.storeName}`,
                        description: formattedMessage,
                        color: 0xFF0000,
                        timestamp: new Date().toISOString(),
                        fields: [
                            {
                                name: 'Store',
                                value: this.storeName,
                                inline: true
                            },
                            {
                                name: 'Device',
                                value: this.deviceType,
                                inline: true
                            }
                        ],
                        footer: {
                            text: `Log Directory: ${this.logDir}`
                        }
                    }]
                };

                await axios.post(this.discordWebhookUrl, payload);
            } catch (error) {
                console.error('Failed to send Discord webhook:', error.message);
            }
        }).catch(error => {
            console.error('Webhook promise error:', error.message);
        });
    }

    log(message, severity = 'INFO') {
        try {
            // Main logging functionality
            const timestamp = new Date().toISOString();
            const logMessage = `${timestamp} - ${severity}: ${message}\n`;
            const logFile = this.getLogFilename();

            fs.appendFileSync(logFile, logMessage);
            console.log(logMessage);

            // Send webhook for ERROR severity - fire and forget
            if (this.discordWebhookUrl && severity === 'ERROR') {
                this.sendDiscordWebhook(message);
            }
        } catch (err) {
            console.error('Error writing to log file:', err);
        }
    }
}


module.exports = Logger;