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

function getCities($code)
{
    global $triposo;
    global $tripToken;
    $code = ($code === "GB") ? "UK" : $code;
    $url = "https://www.triposo.com/api/20210317/location.json?countrycode=$code&fields=attribution,coordinates,name,snippet&account=$triposo&token=$tripToken";
    $cities = json_decode(curl($url));
    if (isset($cities->results)) {
        foreach ($cities->results as $city) {
            foreach ($city->attribution as $link) {
                if ($link->source_id === "wikipedia") {
                    $city->wiki = $link->url;
                }
            }
            if (!isset($city->wiki)) {
                $wikiResult = json_decode(Wiki($city->name));
                $city->wiki = $wikiResult[3][0] ?? null;
            }
            $city->weather = getWeather($city->name, $code) ?? null;
        }
        return $cities;
    }
}

function getCurrencies($base)
{
    $url = "https://api.exchangerate.host/latest?base=$base&symbols=AUD,CAD,CHF,CNY,EUR,GBP,HKD,JPY,USD";
    $ratesResult = curl($url);
    $ratesResult = json_decode($ratesResult);
    $flags = ["AUD" => "svg\Australia.svg", "CAD" => "svg\Canada.svg", "CHF" => "svg\Switzerland.svg", "CNY" => "svg\China.svg", "EUR" => "svg\Europe.svg", "GBP" => "svg\UK.svg", "HKD" => "svg\Hong_Kong.svg", "JPY" => "svg\Japan.svg", "USD" => "svg\USA.svg"];
    if ($ratesResult->success) {
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
    if (($status = $opencage->status->code ?? null) && $status === 200 && ($result = $opencage->results[0] ?? null)) {
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

                $mountains = getGeonamesTop10("mountains", $countryCode);
                $output->mountains = $mountains;

                $cities = getCities($countryCode)->results ?? null;
                $output->cities = $cities;
            }
            return json_encode($output);
        }
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

function getGeonamesTop10($feature, $code)
{
    global $geonames;
    switch ($feature) {
        case "cities":
            $featureClass = "P";
            $order = "population";
            break;
        case "mountains":
            $featureClass = "T";
            $order = "elevation";
            break;
    }

    $url = "http://api.geonames.org/searchJSON?featureClass=$featureClass&maxRows=10&orderby=$order&country=$code&style=full&username=$geonames";
    $top10 =  json_decode(curl($url));
    if ($top10->totalResultsCount > 0) {
        $geonamesData = $top10->geonames;
        for ($i = 0; $i < count($geonamesData); $i++) {
            $geoname = $geonamesData[$i];
            if ($list = $geoname->alternateNames ?? null) {
                foreach ($list as $index => $value) {
                    if ($value->lang === "link") {
                        $geoname->wiki = $value->name;
                        break;
                    }
                }
            }
            $location = $geoname->name;
            if (!isset($geoname->wiki)) {
                $wikiResult = json_decode(Wiki($location));
                $top10->geonames[$i]->wiki = $wikiResult[3][0] ?? null;
            }
            if ($feature === "cities") {
                $top10->geonames[$i]->weather = getWeather($location, $code) ?? null;
            }
        }
        return $top10->geonames;
    }
}

function getWeather($location, $country)
{
    global $weather;
    $url = "https://api.openweathermap.org/data/2.5/weather?q=$location,$country&units=metric&appid=$weather";
    $result = json_decode(curl($url));
    if ($result->cod === 200) {
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
    $url = "https://restcountries.eu/rest/v2/alpha/$code";
    return curl($url);
}

function Wiki($search)
{
    $search = urlencode($search);
    $url = "https://en.wikipedia.org/w/api.php?action=opensearch&search=$search&limit=1";
    return curl($url);
}
