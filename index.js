require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
// const morgan = require("morgan");
const AppError = require("./utils/appError");
// const fileUpload = require("express-fileupload");
const headers = require("./middlewares/headers")
const ipfilter = require('express-ipfilter').IpFilter
const IpDeniedError = require('express-ipfilter').IpDeniedError



const app = express();

const message = {
    message: "Hello world! Welcome to HEIDI Terminal!!",
};

app.use(helmet());
app.use(bodyParser.json());

const allowlist = ['::ffff:192.168.0.103'];

app.use(ipfilter(allowlist, { mode: 'allow' }))
app.use((err, req, res, _next) => {
    if (err instanceof IpDeniedError) {
        res.status(401).send("Access Denied")
    } else {
      res.status(err.status || 500)
    }
  })

app.use(cors())
app.use(headers)

app.get("/", (req, res) => {
    res.send(message);
});

app.get("/startpayment", (req,res) => {
    const amount = req.query.amount ? req.query.amount : false
    if(!amount) {
        res.send(`Amount is not sent`, 400)
    }
    if(Number(amount) == NaN || Number(amount) <= 5 || Number(amount) > 100){
        res.send(`Invalid Amount sent`, 400)
    }
    const { spawn } = require('child_process');

    const process = spawn('./Portalum.Zvt.EasyPay.exe', ['--amount', amount]);

    process.on('close', (returnCode) => {
        console.log(`Process exited with code ${returnCode}`);
        if(returnCode == 0) {
            res.send(`Successsssss`)
        } else {
            res.send(`Failed with status code ${returnCode}`) 
        }
       
    });
    
});

app.all("*", (req, res, next) => {
    next(new AppError(`The URL ${req.originalUrl} does not exists`, 404));
});
app.listen(process.env.PORT, () => {
    console.log(`listening on port ${process.env.PORT}`);
});