window.map = L.map("map", {
  attributionControl: false,
  minZoom: 2,
  maxBounds: [
    [-180, -180],
    [180, 180],
  ],
  zoomControl: false,
});
window.cityMarkers = L.layerGroup();
window.mountainMarkers = L.layerGroup();
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
        '<option value="" disabled selected>Select a country</option>'
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

function displayCountryInfo() {
  let country = {};
  const opencage = countryData.opencage;
  const rest = countryData.rest;
  country["Country Code"] = opencage.components.country_code;
  country.Capital = rest.capital || null;
  country.Continent = opencage.components.continent || null;
  let population = rest.population || null;
  if (population) {
    country.Population = formatNumber(population);
  }
  let landArea = rest.area || null;
  if (landArea) {
    landArea = formatNumber(landArea);
    country["Land Area"] = `${landArea} km<sup>2</sup>`;
  }
  const tz = opencage.annotations.timezone.short_name || null;
  let offset = opencage.annotations.timezone.offset_string || null;
  offset = offset ? `(${offset})` : null;
  country["Time Zone"] = `${tz} ${offset}`;
  callcode = opencage.annotations.callingcode || null;
  country["Calling Code"] = callcode ? `+${callcode}` : null;
  country["TLD"] = rest.topLevelDomain || null;
  country.Demonym = rest.demonym || null;
  const wiki = countryData.wiki || null;
  country.Wikipedia = wiki
    ? `<a href="${wiki}" target="_blank">Wikipedia</a>`
    : null;
  let langArr = [];
  rest.languages.forEach((lang) => langArr.push(lang.name));
  if (langArr.length > 1) {
    country.Languages = langArr.join(", ");
  } else {
    country.Language = langArr[0];
  }

  const properties = Object.keys(country).sort();
  let countryDetails = {};
  properties.forEach((prop) => (countryDetails[prop] = country[prop]));
  $("#countryName").html(
    `${countryName} <img src="${rest.flag}" class="thumbnail alt="country flag">`
  );
  for (let key in countryDetails) {
    if (countryDetails[key]) {
      $("#infoTable").append(`<tr></tr>`);
      $("#infoTable tr:last-child").append(`<th scope"row">${key}</th>`);
      $("#infoTable tr:last-child").append(`<td >${countryDetails[key]}</td>`);
    }
  }
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
  window.borders = L.polygon(borders).addTo(map);
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
    const cityMarker = L.marker([city.lat, city.lng], {
      icon: cityIcon,
      title: city.name,
    });

    let details = `<h2>${city.name}</h2>`;
    if (city.name === countryData.rest.capital) {
      details += `<p class="lead">Capital</p>`;
    }
    details += `<p><strong>Population:</strong> ${formatNumber(
      city.population
    )}</p>`;
    if (city.wiki) {
      details += `<p><a href="${city.wiki}" target="_blank">Wikipedia</a></p>`;
    }
    if (city.weather) {
      details += weather(city.weather);
    }

    cityMarker.bindPopup(details);
    cities.push(cityMarker);
  });
  window.cityMarkers = L.layerGroup(cities).addTo(map);
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
    const mountainMarker = L.marker([mountain.lat, mountain.lng], {
      icon: mountainIcon,
      title: mountain.name,
    });
    let details = `<h2>${mountain.name}</h2>`;
    let elevation = mountain.elevation || null;
    elevation = elevation ? elevation + " m" : "undefined";
    details += `<p><strong>Elevation:</strong> ${elevation} </p>`;
    if (mountain.wiki) {
      details += `<p><a href="${mountain.wiki}" target="_blank">Wikipedia</a></p>`;
    }
    mountainMarker.bindPopup(details);
    mountains.push(mountainMarker);
  });
  window.mountainMarkers = L.layerGroup(mountains).addTo(map);
}

function displayRates() {
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
  const flag = code === "EUR" ? "svg\\Europe.svg" : countryData.rest.flag;
  $("#countryCurrencyFlag").attr({ src: flag, alt: `${countryName} flag` });
  $("#countryCurrencyCode").text(code);
  $("#countryCurrency").html(`${name} ${units}`);

  for (const currency in countryData.rates.rates) {
    const rate = Number(countryData.rates.rates[currency]).toFixed(3);
    const flag = countryData.rates.flags[currency];
    $currency = $("<tr/>");
    $currency.append(
      `<td><img src='${flag}' class='currencyFlag' alt="${currency} flag"></td>`
    );
    $currency.append(`<th scope='row' class="">${currency}</th>`);
    $currency.append(`<td class="w-50 text-right">${rate}</td>`);
    $("#financeTable").append($currency);
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

function getCountry({ countryName, lat, lng }) {
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
        $("#ratesError").toggleClass("d-none");
      }
      if (data.mountains || null) {
        displayMountains();
      }
      if (data.cities || null) {
        displayCities();
      }
      window.infoButton.enable();
    }
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

function onLocationError(e) {
  alert(e.message);
}

function onLocationFound(e) {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  getCountry({ lat, lng });
}

function onMapClick(e) {
  const lat = e.latlng.lat % 90;
  const lng = e.latlng.lng > 180 ? e.latlng.lng - 360 : e.latlng.lng;
  getCountry({ lat, lng });
}

function resetMap() {
  if (window.borders) {
    map.removeLayer(borders);
  }
  map.removeLayer(cityMarkers);
  map.removeLayer(mountainMarkers);
  if (window.infoButton) {
    window.infoButton.disable();
  }
  $("#infoTable").empty();
  $("#financeTable").empty();
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
