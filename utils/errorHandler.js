const axios = require("axios");
const getDateInFormate = require("./getDateInFormate");
const app = `CONTAINER CITY_ID: ${process.env.CITYID} STORE_ID: ${process.env.STOREID}`;

// Helper function to create error message content
function createErrorContent(app, message, stack, time, sentryUrl) {
    return {
        "content": `There was an uncaught exception in your ${app} NodeAPI at ${time}`,
        "embeds": [
            {
                "title": message,
                "description": stack,
                "color": 16515072,
                "url": sentryUrl
            }
        ]
    };
}

// Function to send the error message to Discord
function sendErrorToDiscord(err, sentryEventId = null) {
    const sentryUrl = sentryEventId
        ? `https://sentry.io/organizations/${process.env.SENTRY_ORG_NAME}/issues/?query=${sentryEventId}`
        : '';
    
    const occuredAt = new Date();
    const content = createErrorContent(
        app,
        err.message ? err.message : err,
        err.stack ? err.stack : "",
        getDateInFormate(occuredAt),
        sentryUrl
    );

    return axios.post(process.env.DISCORD_WEBHOOK, content);
}

// Express middleware function to handle errors with `res` response
function handleErrorWithRes(err, req, res, next) {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";
    
    if (err.statusCode === 500 && process.env.ENVIRONMENT === 'production') {
        const sentryEventId = res?.sentry || null;
        sendErrorToDiscord(app, err, sentryEventId);
    }

    // Send error response to client
    res.status(err.statusCode).json({
        status: err.status,
        errorCode: err.errorCode,
        message: err.message,
    });
}

module.exports = {
    sendErrorToDiscord,
    handleErrorWithRes,
};
