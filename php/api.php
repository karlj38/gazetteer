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
    $result = $opencage->results[0] ?? null;
    // if (($status = $opencage->status->code ?? null) && $status === 200 && ($result = $opencage->results[0] ?? null)) {
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

            $cities = triposo($countryCode, "cities")->results ?? null;
            $output->cities = $cities;

            $POIs = triposo($countryCode, "poi")->results ?? null;
            $output->POIs = $POIs;

            $iso3Code = $borders->properties->iso_a3;
            $covid = getCovid($iso3Code);
            $output->covid = $covid;
        }
        return json_encode($output);
    }
    // }
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

function getNews($code)
{
    global $news;
    $countries = ["AE", "AR", "AT", "AU", "BE", "BG", "BR", "CA", "CH", "CN", "CO", "CU", "CZ", "DE", "EG", "FR", "GB", "GR", "HK", "HU", "ID", "IE", "IL", "IN", "IT", "JP", "KR", "LT", "LV", "MA", "MX", "MY", "NG", "NL", "NO", "NZ", "PH", "PL", "PT", "RO", "RS", "RU", "SA", "SE", "SG", "SI", "SK", "TH", "TR", "TW", "UA", "US", "VE", "ZA"];
    if (in_array($code, $countries)) {
        $url = "https://newsapi.org/v2/top-headlines?country=$code&apiKey=$news";
        return json_decode(curl($url));
    }
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
    $url = "https://restcountries.eu/rest/v2/alpha/$code";
    return curl($url);
}

function triposo($code, $query)
{
    global $triposo;
    global $tripToken;
    $code = ($code === "GB") ? "uk" : strtolower($code);
    if ($query === "cities") {
        $api = "location";
        $type = "type=city&";
    } else if ($query === "poi") {
        $api = "poi";
        $type = "";
    }
    $url = "https://www.triposo.com/api/20210317/$api.json?$type" . "countrycode=$code&fields=attribution,coordinates,name,snippet&account=$triposo&token=$tripToken";
    $data = json_decode(curl($url));
    if (isset($data->results)) {
        foreach ($data->results as $place) {
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
