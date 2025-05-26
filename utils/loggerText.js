// loggerText.js
const winston = require("winston");

const cetTimestamp = () => {
  return new Date().toLocaleString("en-GB", { timeZone: "CET" });
};

const loggerText = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.printf(({ level, message }) => {
      return `[${cetTimestamp()}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

module.exports = loggerText;
