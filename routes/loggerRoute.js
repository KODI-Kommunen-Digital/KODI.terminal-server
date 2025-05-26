const express = require('express');
const loggerText = require('../utils/loggerText'); // adjust if your path is different

const loggerRoute = express.Router();

loggerRoute.post("/api/logger/logTER", (req, res) => {
  const { level = "info", message = "", context = {} } = req.body;

  if (typeof loggerText[level] === "function") {
    loggerText[level](`${message} | Context: ${JSON.stringify(context)} | Frontend`);
  } else {
    loggerText.info(`${message} | Context: ${JSON.stringify(context)} | Frontend`);
  }

  res.json({ status: "logged" });
});

module.exports = loggerRoute;
