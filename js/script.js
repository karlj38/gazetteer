window.map = L.map("map", {
  attributionControl: false,
  minZoom: 2,
  maxBounds: [
    [-180, -180],
    [180, 180],
  ],
  zoomControl: false,
});
window.markers = L.markerClusterGroup({ showCoverageOnHover: false });
window.countryData = null;
window.countryName = null;
window.countryCode = null;
window.infoButton = null;

$(function () {
  init();
});

function addCountryListControl() {
  L.Control.CountryList = L.Control.extend({
    onAdd: function () {
      $select = $(
        '<select id="countryList" class="form-control leaflet-control leaflet-bar" onchange="validateCountry(this.value)"></select>'
      );
      $select.append(
        '<option value="" disabled selected hidden>Select a country</option>'
      );
      return $select.get(0);
    },
  });
  L.control.countryList = function (opts) {
    return new L.Control.CountryList(opts);
  };
  L.control
    .countryList({
      position: "topleft",
    })
    .addTo(map);
  L.DomEvent.disableClickPropagation($("#countryList").get(0));
}

function checkURLHash() {
  if (location.hash) {
    hash = decodeURI(location.hash.substring(1));
    validateCountry(hash);
  } else {
    map.locate();
  }
}

function convertTime(unix, offset) {
  const d = new Date((unix + offset) * 1000);
  let hours = d.getUTCHours();
  hours = hours < 10 ? `0${hours}` : hours;
  let mins = d.getUTCMinutes();
  mins = mins < 10 ? `0${mins}` : mins;
  return `${hours}:${mins}`;
}

function displayBorders() {
  const data = countryData.borders.geometry;
  let borders = [];
  if (data.type === "MultiPolygon") {
    data.coordinates.forEach((poly) => {
      let coords = [];
      poly[0].forEach((coord) => {
        const lat = coord[1];
        const lng = coord[0];
        coords.push([lat, lng]);
      });
      borders.push(coords);
    });
  } else {
    data.coordinates[0].forEach((coord) => {
      const lng = coord[0];
      const lat = coord[1];
      borders.push([lat, lng]);
    });
  }
  map.fitBounds(borders);
  window.borders = L.polygon(borders, { bubblingMouseEvents: false }).addTo(
    map
  );
  L.DomEvent.disableClickPropagation($(window.borders).get(0));
}

function displayCountryInfo() {
  const opencage = countryData.opencage;
  const rest = countryData.rest;
  let country = {};
  callcode = opencage.annotations.callingcode || null;
  country.callingCode = callcode ? `+${callcode}` : null;
  country.capital = rest.capital || null;
  country.continent = opencage.components.continent || null;
  country.countryCode = opencage.components.country_code || null;
  country.demonym = rest.demonym || null;
  let landArea = rest.area || null;
  if (landArea) {
    landArea = formatNumber(landArea);
    country.landArea = landArea;
  }
  let langArr = [];
  rest.languages.forEach((lang) => langArr.push(lang.name));
  if (langArr.length > 1) {
    country.languages = langArr.join(", ");
    country.language = null;
  } else {
    country.language = langArr[0];
    country.languages = null;
  }
  let population = rest.population || null;
  if (population) {
    country.population = formatNumber(population);
  }
  country.tld = rest.topLevelDomain[0] || null;
  const tz = opencage.annotations.timezone.short_name || null;
  let offset = opencage.annotations.timezone.offset_string || null;
  offset = offset ? `(${offset})` : null;
  country.tz = `${tz} ${offset}`;

  $("#countryName").text(countryName);
  $("#countryFlag").attr("src", rest.flag);
  for (let key in country) {
    if (country[key]) {
      $(`#${key}`).html(country[key]);
      $(`#${key}Row`).show();
    } else {
      $(`#${key}Row`).hide();
    }
  }
  country.wiki = countryData.wiki || null;
  $("#wiki").attr("href", country.wiki);

  displayMainCurrency();
}

function displayCities() {
  const data = countryData.cities;
  let cities = [];
  data.forEach((city) => {
    const cityIcon = L.ExtraMarkers.icon({
      prefix: "fa",
      icon: "fa-city",
      markerColor: city.name === countryData.rest.capital ? "red" : "yellow",
    });
    const cityMarker = L.marker(
      [city.coordinates.latitude, city.coordinates.longitude],
      {
        icon: cityIcon,
        title: city.name,
      }
    );

    cityMarker.on("click", function () {
      markerModal({
        title: city.name,
        summary: city.snippet,
        image: city.images ? city.images.sizes.thumbnail.url : null,
        wiki: city.wiki,
      });
      if (city.weather) {
        weather(city.weather);
      } else {
        $("#weather").addClass("d-none");
      }
    });
    cities.push(cityMarker);
  });
  window.markers.addLayers(cities).addTo(map);
}

function displayCovid() {
  const covid = countryData.covid;
  let data = {};
  lastEntry = covid.length - 1;
  recent = covid[lastEntry];
  prevD = covid[lastEntry - 1];
  prevW = covid[lastEntry - 7];
  prevM = covid[lastEntry - 30];
  data.latestDate = recent.date;
  data.tC = formatNumber(recent.confirmed);
  data.tD = formatNumber(recent.deaths);
  data.tR = formatNumber(recent.recovered);
  data.lC = formatNumber(recent.confirmed - prevD.confirmed);
  data.lD = formatNumber(recent.deaths - prevD.deaths);
  data.lR = formatNumber(recent.recovered - prevD.recovered);
  data.wC = formatNumber(recent.confirmed - prevW.confirmed);
  data.wD = formatNumber(recent.deaths - prevW.deaths);
  data.wR = formatNumber(recent.recovered - prevW.recovered);
  data.mC = formatNumber(recent.confirmed - prevM.confirmed);
  data.mD = formatNumber(recent.deaths - prevM.deaths);
  data.mR = formatNumber(recent.recovered - prevM.recovered);
  for (const key in data) {
    if (Object.hasOwnProperty.call(data, key)) {
      const value = data[key];
      $(`#${key}`).text(value);
    }
  }
  $("#covid-link").removeClass("d-none");
}

function displayMainCurrency() {
  const currency = countryData.opencage.annotations.currency;
  const symbol = currency.html_entity || currency.symbol || null;
  const code = currency.iso_code || null;
  const name = currency.name || null;
  const sub = currency.subunit || null;
  let units = null;
  if (symbol && sub) {
    units = `(${symbol} / ${sub})`;
  } else if (symbol && !sub) {
    units = `(${symbol})`;
  } else if (!symbol && sub) {
    units = `(${sub})`;
  }
  const flag =
    currency.iso_code === "EUR" ? "svg\\Europe.svg" : countryData.rest.flag;
  $("#countryCurrencyFlag").attr({ src: flag, alt: `${countryName} flag` });
  $("#countryCurrencyCode").text(code);
  $("#countryCurrency").html(`${name} ${units}`);
}

function displayMountains() {
  let mountains = [];
  const mountainIcon = L.ExtraMarkers.icon({
    prefix: "fa",
    icon: "fa-mountain",
    markerColor: "green",
  });
  const data = countryData.mountains;
  data.forEach((mountain) => {
    const mountainMarker = L.marker(
      [mountain.coordinates.latitude, mountain.coordinates.longitude],
      {
        icon: mountainIcon,
        title: mountain.name,
      }
    );

    mountainMarker.on("click", function () {
      markerModal({
        title: mountain.name,
        summary: mountain.snippet,
        image: mountain.images ? mountain.images.sizes.thumbnail.url : null,
        wiki: mountain.wiki,
      });
    });
    mountains.push(mountainMarker);
  });
  window.markers.addLayers(mountains).addTo(map);
}

function displayPOIs() {
  const data = countryData.POIs;
  let pois = [];
  const poiIcon = L.ExtraMarkers.icon({
    prefix: "fa",
    icon: "fa-star",
    markerColor: "blue",
  });
  data.forEach((poi) => {
    const poiMarker = L.marker(
      [poi.coordinates.latitude, poi.coordinates.longitude],
      {
        icon: poiIcon,
        title: poi.name,
      }
    );
    poiMarker.on("click", function () {
      markerModal({
        title: poi.name,
        summary: poi.snippet,
        image: poi.images ? poi.images.sizes.thumbnail.url : null,
        wiki: poi.wiki,
      });
    });
    pois.push(poiMarker);
  });
  window.markers.addLayers(pois).addTo(map);
}

function displayRates() {
  const currency = countryData.opencage.annotations.currency;
  const symbol = currency.html_entity || currency.symbol || null;
  const code = currency.iso_code || null;
  const exchange = countryData.rates;
  for (const ex in exchange.rates) {
    const rate = Number(exchange.rates[ex]).toFixed(3);
    const flag = exchange.flags[ex];
    $(`#${ex}Flag`).attr({ src: flag, alt: ex + " flag" });
    $(`#${ex}Code`).text(ex);
    $(`#${ex}Rate`).text(rate);
    $(`#${ex}Row`).removeClass("d-none");
    $("#financeTable").removeClass("d-none");
    $("#ratesError").addClass("d-none");
    if (ex === code) {
      $(`#${ex}Row`).addClass("d-none");
    }
  }
}

function formatNumber(n) {
  if (n > 10 ** 9) {
    return (n / 10 ** 9).toPrecision(2) + " billion";
  } else if (n > 10 ** 8) {
    return Math.round(n / 10 ** 6) + " million";
  } else if (n > 10 ** 6) {
    return (n / 10 ** 6).toPrecision(2) + " million";
  } else if (n > 10 ** 4) {
    return Math.round(n / 10 ** 3) + ",000";
  } else {
    return n;
  }
}

function geocode(lat, lng) {
  $.getJSON("php/api", { get: "geocode", lat, lng }, function (data, status) {
    if (data.country_code || null) {
      getCountry({ lat, lng });
    }
  });
}

function getCountry({ countryName, lat, lng }) {
  if ($("#preloader").is(":hidden")) {
    map.spin(true);
  }
  resetMap();
  let params = { get: "country" };
  if (countryName) {
    params.country = countryName;
  } else if (lat && lng) {
    params.lat = lat;
    params.lng = lng;
  }
  $.getJSON("php/api", params, function (data, status) {
    console.log(data);
    if (lat && lng) {
      window.countryName = data.opencage.components.country;
      window.countryCode = data.opencage.components.country_code;
    }
    window.countryData = data;
    document.title = `Gazetteer | ${window.countryName}`;
    location.hash = window.countryName;

    if (data.opencage && data.rest) {
      if (data.borders || null) {
        displayBorders();
      }
      displayCountryInfo();
      if (data.rates || null) {
        displayRates();
      } else {
        $("#financeTable").addClass("d-none");
        $("#ratesError").removeClass("d-none");
      }
      if (data.mountains || null) {
        displayMountains();
      }
      if (data.cities || null) {
        displayCities();
      }
      if (data.POIs || null) {
        displayPOIs();
      }
      if (data.covid || null) {
        displayCovid();
      } else {
        $("#covid-link").addClass("d-none");
      }
      window.infoButton.enable();
    }
  }).then(function () {
    $("#preloader").fadeOut();
    map.spin(false);
  });
}

function getCountryList() {
  $.getJSON("php/api", { get: "countryList" }, function (data, status) {
    data.forEach((country) => {
      const id = country[0].replace(/ /g, "-");
      $("#countryList").append(
        `<option id="${id}" value="${country[0]}" data="${country[1]}">${country[0]}</option>`
      );
    });
  }).then(checkURLHash);
}

function init() {
  map.on("click", onMapClick);
  map.on("locationfound", onLocationFound);
  map.on("locationerror", onLocationError);
  L.control
    .attribution({
      prefix: '<a href="https://www.leafletjs.com" target="_blank">Leaflet</a>',
    })
    .addTo(map);
  const sat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    }
  ).addTo(map);
  const night = L.tileLayer(
    "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/{time}/{tilematrixset}{maxZoom}/{z}/{y}/{x}.{format}",
    {
      attribution:
        'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov" target="_blank">ESDIS</a>) with funding provided by NASA/HQ.',
      bounds: [
        [-85.0511287776, -179.999999975],
        [85.0511287776, 179.999999975],
      ],
      minZoom: 1,
      maxZoom: 8,
      format: "jpg",
      time: "",
      tilematrixset: "GoogleMapsCompatible_Level",
    }
  );
  const street = L.tileLayer(
    "https://{s}.tile.jawg.io/jawg-streets/{z}/{x}/{y}{r}.png?access-token=Kyyk5x2h2cziidv4NudH48i2lgxN5j1e3lo5CtRHb8th7m5mbfxeq7qB71thO2ZE",
    {
      attribution:
        '<a href="http://jawg.io" title="Tiles Courtesy of Jawg Maps" target="_blank">&copy; <b>Jawg</b>Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      minZoom: 0,
      maxZoom: 22,
      subdomains: "abcd",
      accessToken:
        "Kyyk5x2h2cziidv4NudH48i2lgxN5j1e3lo5CtRHb8th7m5mbfxeq7qB71thO2ZE",
    }
  );
  const dark = L.tileLayer(
    "https://{s}.tile.jawg.io/jawg-dark/{z}/{x}/{y}{r}.png?access-token=Kyyk5x2h2cziidv4NudH48i2lgxN5j1e3lo5CtRHb8th7m5mbfxeq7qB71thO2ZE",
    {
      attribution:
        '<a href="http://jawg.io" title="Tiles Courtesy of Jawg Maps" target="_blank">&copy; <b>Jawg</b>Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      minZoom: 0,
      maxZoom: 22,
      subdomains: "abcd",
      accessToken:
        "Kyyk5x2h2cziidv4NudH48i2lgxN5j1e3lo5CtRHb8th7m5mbfxeq7qB71thO2ZE",
    }
  );
  const baseLayers = {
    Streets: street,
    Dark: dark,
    Satellite: sat,
    Night: night,
  };
  map.fitWorld();
  addCountryListControl();
  getCountryList();
  L.control.zoom({ position: "topright" }).addTo(map);
  L.easyButton(
    "fa-location-arrow",
    function () {
      map.locate();
    },
    { position: "topright" }
  ).addTo(map);
  L.control.layers(baseLayers).addTo(map);
  window.infoButton = L.easyButton(
    "fa-info",
    function () {
      $("#countryModal").modal("toggle");
    },
    { position: "topleft" }
  )
    .addTo(map)
    .disable();
}

function markerModal({ title, summary, image, wiki }) {
  $("#markerTitle").text(title);
  $("#markerSummary").html(summary);
  if (title === countryData.rest.capital) {
    $("#markerCapital").removeClass("d-none");
  } else {
    $("#markerCapital").addClass("d-none");
  }
  if (image) {
    const https = image.replace("http", "https");
    $("#markerImg")
      .attr({ src: https, alt: title })
      .removeClass("d-none")
      .addClass("d-block");
  } else {
    $("#markerImg").addClass("d-none").removeClass("d-block");
  }
  if (wiki) {
    $("#markerLink").attr("href", wiki);
    $("#markerLink").removeClass("d-none");
  } else {
    $("#markerLink").addClass("d-none");
  }
  $("#weather").addClass("d-none");
  $("#markerModal").modal("toggle");
}

function onLocationError(e) {
  alert(e.message);
  $("#preloader").fadeOut();
}

function onLocationFound(e) {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  getCountry({ lat, lng });
}

function onMapClick(e) {
  const lat = e.latlng.lat % 90;
  const lng = e.latlng.lng > 180 ? e.latlng.lng - 360 : e.latlng.lng;
  geocode(lat, lng);
}

function resetMap() {
  if (window.borders) {
    map.removeLayer(borders);
  }
  window.markers.clearLayers();
  if (window.infoButton) {
    window.infoButton.disable();
  }
}

function validateCountry(country) {
  const countryId = country.replace(/ /g, "-");
  if ($(`#${countryId}`).length) {
    window.countryName = country;
    window.countryCode = $(`#${countryId}`).attr("data");
    getCountry({ countryName });
  } else {
    alert("Not a valid country");
  }
}

function weather(weather) {
  $("#summaryIcon").attr("class", `wi wi-owm-${weather.weather[0].id}`);
  $("#summaryText").text(weather.weather[0].description);
  const current = Math.round(weather.main.temp);
  const feel = Math.round(weather.main.feels_like);
  $("#currentTemp").text(current);
  if (current !== feel) {
    $("#feelsLike").text(feel);
    $("#feels").removeClass("d-none");
  } else {
    $("#feels").addClass("d-none");
  }
  $("#maxTemp").text(Math.round(weather.main.temp_max));
  $("#minTemp").text(Math.round(weather.main.temp_min));
  $("#windSpeed").text(Math.round(weather.wind.speed));
  $("#windIcon").attr("class", `wi wi-wind from-${weather.wind.deg}-deg`);
  $("#windDir").text(weather.wind.deg);
  $("#humidity").text(weather.main.humidity);
  $("#pressure").text(weather.main.pressure);
  $("#sunrise").text(convertTime(weather.sys.sunrise, weather.timezone));
  $("#sunset").text(convertTime(weather.sys.sunset, weather.timezone));
  $("#weather").removeClass("d-none");
}
