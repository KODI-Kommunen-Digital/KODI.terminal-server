const headers = async function (req, res, next) {

    // Set Permissions-Policy header
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

    // Set Strict-Transport-Security header
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

    // Set X-Content-Type-Options header
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Set Referrer-Policy header
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    next();

};

module.exports = headers;