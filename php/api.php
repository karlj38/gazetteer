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
