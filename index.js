const cheerio = require('cheerio');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

const emptyChar = '⠀';

fetch("http://udim.koeri.boun.edu.tr/zeqmap/xmlt/son24saat.xml")
    .then(res => res.text())
    .then(res => evalRes(res))
    .catch(err => console.log(err));


let comparer = (otherArray) => {
    return function (current) {
        return otherArray.filter(function (other) {
            return other.date === current.date
        }).length == 0;
    }
}


let evalRes = (res) => {
    const $ = cheerio.load(res, { xmlMode: true });
    const earthquakesDOM = getEarthquakesDOM($);
    const networkEarthquakes = createEarthquakesArray($, earthquakesDOM);
    readLocalFileEarthquakes().then(strLocalEarthquakes => {
        const localEarthquakes = JSON.parse(strLocalEarthquakes);
        const newEarthquakes = networkEarthquakes.filter(comparer(localEarthquakes));
        console.log('newEarthquakes', newEarthquakes);
        const earthquakes = getEarthquakesBySelectedCriteria(newEarthquakes);
        console.log('earthquakes', earthquakes);
        sendNewEarthQuakesTweets(earthquakes);
        writeEarthquakesToFile(networkEarthquakes);
        if (earthquakes.length === 0) {
            console.log('Earthquake not happened');
            return;
        }
    })
        .catch(err => console.log(err));
}

let getEarthquakesDOM = ($) => {
    return $('earhquake');
}

let createEarthquakesArray = ($, earthquakesDOM) => {
    let earthquakes = [];
    earthquakesDOM.each((index, earthquake) => {
        earthquakes.push(createEarthQuakeObj($, earthquake));
    });
    return earthquakes;
}

let createEarthQuakeObj = ($, earthquake) => {
    const date = $(earthquake).attr("name").trim();
    const location = $(earthquake).attr("lokasyon").replace(/\s\s+/g, ' ').trim();
    const lat = $(earthquake).attr("lat").trim();
    const lng = $(earthquake).attr("lng").trim();
    const mag = $(earthquake).attr("mag").trim();
    const depth = $(earthquake).attr("Depth").trim();
    return { date, location, lat, lng, mag, depth };
}

let writeEarthquakesToFile = (earthquakes) => {
    fs.writeFile('previousEarthquakes.json', JSON.stringify(earthquakes), function (err) {
        if (err) return console.log(err);
        console.log('Written earthquakes.json');
    });
}
const readFile = async filePath => {
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        return data;
    } catch (err) {
        console.log(err);
    }
}

let readLocalFileEarthquakes = () => {
    return readFile('previousEarthquakes.json');
}

const getEarthquakesBySelectedCriteria = newEarthquakes => {
    const foundEarthquakes = [];
    const cities = process.env.CITIES_DELIMITED_WITH_SEMICOLON.split(';');
    const minMagnitude = process.env.MIN_MAGNITUDE;
    newEarthquakes.forEach(earthquake => {
        cities.forEach(city => {
            if ((city === "*" || earthquake.location.includes(city)) && earthquake.mag >= minMagnitude) {
                foundEarthquakes.push(earthquake);
            }
        });
    });
    return foundEarthquakes;
}

let sendNewEarthQuakesTweets = (earthquakes) => {
    earthquakes.forEach(earthquake => {
        sendTweet(createTweetText(earthquake),
        generateImageUrl(earthquake));
    });
}

let createTweetText = (earthquake) => {
    let date = earthquake.date;
    if (date.includes(' ')) {
        date = date.split(' ')[1];
    }
    return `💢 ${earthquake.location}'de #deprem Büyüklük: ${earthquake.mag} Zaman: ${date}`;
}

let writeTweetToFile = (tweet) => {
    fs.writeFile('tweet.txt', tweet, function(err) {
        if (err) return console.log(err);
        console.log('Written tweet.txt');
    });
}

let generateImageUrl = (earthquake) => {
    const apiKey = process.env.HERE_API_KEY;
    const url = `https://image.maps.ls.hereapi.com/mia/1.6/mapview?apiKey=${apiKey}&f=1&lat=${earthquake.lat}&lon=${earthquake.lng}&h=675&w=1200&ml=tur&ml2=eng&z=8.2`;
    return url
}

let sendTweet = (tweetText, imageUrl) => {
    const webhookKey = process.env.IFTTT_WEBHOOKS_KEY;
    const iftttEventName = process.env.IFTTT_EVENT;
    fetch(`https://maker.ifttt.com/trigger/${iftttEventName}/with/key/${webhookKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(
            {   "value1" : imageUrl,
                "value2" : tweetText
            })
    })
    .then(response => console.log('Sent', response.text))
    .catch(error => console.log('Sending error', error));
    writeTweetToFile(tweetText)
}