
function getDateInFormate(date) {
    return date.toISOString().slice(0,10) + " " + date.toLocaleString("CET", {hour: '2-digit', hourCycle: 'h23',  minute:'2-digit', second:'2-digit'})
}

module.exports = getDateInFormate;
