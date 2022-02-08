<?php
include "keys.php";

ini_set("display_errors", "1");
error_reporting(E_ALL);

if ($api = $_GET["get"] ?? null) {
    switch ($api) {
        case "countryList":
            echo getCountrylist();
            break;
        case "country":
            echo getCountry();
            break;
        case "geocode":
            echo geocode();
            break;
    }
}

function curl($url)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_URL, $url);
    $result = curl_exec($ch);
    curl_close($ch);
    return $result;
}

function geocode()
{
    if (($lat = $_GET["lat"] ?? null) && ($lng = $_GET["lng"] ?? null)) {
        $opencage =  json_decode(opencage("$lat+$lng"));
        if ($code = $opencage->results[0]->components->country_code ?? null) {
            return json_encode(["country_code" => $code]);
        }
    }
}

function getBorders($countryCode)
{
    $json =  file_get_contents("../json/countryBorders.geo.json");
    $data = json_decode($json)->features;
    foreach ($data as $country) {
        if ($country->properties->iso_a2 === $countryCode) {
            return $country;
        }
    }
}

function getCovid($code)
{
    $now = date("Y-m-d", time());
    $url = "https://covidapi.info/api/v1/country/$code/timeseries/2020-01-01/$now";
    $data = curl($url);
    $data = json_decode($data);
    if (isset($data->result)) {
        return $data->result;
    }
}
function getCurrencies($base)
{
    $url = "https://api.exchangerate.host/latest?base=$base&symbols=AUD,CAD,CHF,CNY,EUR,GBP,HKD,JPY,USD";
    $ratesResult = curl($url);
    $ratesResult = json_decode($ratesResult);
    $flags = ["AUD" => "svg\Australia.svg", "CAD" => "svg\Canada.svg", "CHF" => "svg\Switzerland.svg", "CNY" => "svg\China.svg", "EUR" => "svg\Europe.svg", "GBP" => "svg\UK.svg", "HKD" => "svg\Hong_Kong.svg", "JPY" => "svg\Japan.svg", "USD" => "svg\USA.svg"];
    if ($ratesResult->success ?? null) {
        $ratesResult->flags = $flags;
        return $ratesResult;
    }
}

function getCountry()
{
    $output = new stdClass();
    if (($lat = $_GET["lat"] ?? null) && ($lng = $_GET["lng"] ?? null)) {
        $opencage = opencage("$lat+$lng");
    } elseif ($country = $_GET["country"] ?? null) {
        $opencage = opencage($country);
    }
    $opencage = json_decode($opencage);
    $result = $opencage->results[0] ?? null;

    if ($countryCode = $result->components->country_code ?? null) {
        $result->components->country_code = strtoupper($countryCode);

        if ($result->components->country_code === "CI") {
            $result->components->country = "Ivory Coast";
        } else if ($result->components->country_code === "XK") {
            $result->components->country = "Kosovo";
        } elseif ($result->components->country === "Somaliland") {
            $result->components->country = "Somalia";
        }

        $country = $country ?? $result->components->country;
        $countryCode = $result->components->country_code;

        if ($borders = getBorders($countryCode) ?? null) {
            $output->borders = $borders;

            $output->opencage = $result;

            $rest = json_decode(restCountry($countryCode));
            $output->rest = $rest ?? null;

            $wiki = json_decode(Wiki($country));
            $output->wiki = $wiki[3][0] ?? null;

            $base = $result->annotations->currency->iso_code;
            $rates = getCurrencies($base);
            $output->rates = $rates ?? null;

            $cities = triposo($countryCode, "cities")->results ?? null;
            $output->cities = $cities;

            $mountains = triposo($countryCode, "mountains")->results ?? null;
            $output->mountains = $mountains;

            $POIs = triposo($countryCode, "poi")->results ?? null;
            $output->POIs = $POIs;

//             $iso3Code = $borders->properties->iso_a3;
//             $covid = getCovid($iso3Code);
//             $output->covid = $covid;
        }
        return json_encode($output);
    }
}

function getCountryList()
{
    $json =  file_get_contents("../json/countryBorders.geo.json");
    $data = json_decode($json)->features;
    $countries = [];

    foreach ($data as $country) {
        $name = $country->properties->name;
        $code = $country->properties->iso_a2;
        array_push($countries, [$name, $code]);
    }
    return json_encode($countries);
}

function getWeather($location, $country)
{
    global $weather;
    $url = "https://api.openweathermap.org/data/2.5/weather?q=$location,$country&units=metric&appid=$weather";
    $result = json_decode(curl($url));
    if (isset($result->cod) && $result->cod === 200) {
        return $result;
    }
}

function openCage($search)
{
    global $opencage;
    $search = urlencode($search);
    $url = "https://api.opencagedata.com/geocode/v1/json?q=$search&pretty=1&limit=1&key=$opencage";
    return curl($url);
}

function restCountry($code)
{
    $url = "https://restcountries.com/v2/alpha/$code";
    return curl($url);
}

function triposo($code, $query)
{
    global $triposo;
    global $tripToken;
    $code = ($code === "GB") ? "uk" : strtolower($code);
    switch ($query) {
        case 'cities':
            $api = "location";
            $type = "type=city&";
            break;
        case 'mountains':
            $api = "poi";
            $type = "tag_labels=poitype-Mountain&";
            break;
        case 'poi':
            $api = "poi";
            $type = "";
            break;
    }

    $url = "https://www.triposo.com/api/20210317/$api.json?$type" . "countrycode=$code&fields=attribution,coordinates,images,name,snippet&account=$triposo&token=$tripToken";
    $data = json_decode(curl($url));
    if (isset($data->results)) {
        foreach ($data->results as $place) {
            $place->images = $place->images[0] ?? null;
            foreach ($place->attribution as $link) {
                if ($link->source_id === "wikipedia") {
                    $place->wiki = $link->url;
                }
            }
            if ($query === "cities") {
                if (!isset($place->wiki)) {
                    $wikiResult = json_decode(Wiki($place->name));
                    $place->wiki = $wikiResult[3][0] ?? null;
                }
                $place->weather = getWeather($place->name, $code) ?? null;
            }
        }
        return $data;
    }
}

function Wiki($search)
{
    $search = urlencode($search);
    $url = "https://en.wikipedia.org/w/api.php?action=opensearch&search=$search&limit=1";
    return curl($url);
}
