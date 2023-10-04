# ElastiXray
X-Ray tool that shows the details of the Elasticsearch analysis process.

## Why ElastiXray?

 * The [Analyze API](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-analyze.html) is great but it only runs one-shot analysis on sample data
 * [Cerebro](https://github.com/lmenezes/cerebro) is a fantastic tool that provides an Analysis tab and improves a great deal the ease of use of the Analyze API.
 * [elyzer](https://github.com/o19s/elyzer) is a great tool, but it aims at showing what happens during each step of the analysis process and does not work with all built-in analyzers.
 * [inquisitor](https://github.com/polyfractal/elasticsearch-inquisitor) was a nice tool that went into a similar direction, but it's no longer maintained.
 * The official [Kibana](https://www.elastic.co/products/kibana) product doesn't provide any feature built upon the Analyze API, however...
 * ...there is a [Kibana plugin](https://github.com/johtani/analyze-api-ui-plugin) that provides a basic UI front-end to the Analyze API, which has only been updated until version 7.17.0. 
 
Enter ElastiXray...

## Description

ElastiXray allows one to retrieve a document from any index and shows how all of its textual content is being analyzed and indexed by Elasticsearch. ElastiXray is a weapon of mass-analysis and heavily leverages the [Analyze API](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-analyze.html) in order to show how a full document is analyzed instead of having to do it field by field.

## Quick example

Let's say we have a `test` index whose settings and mappings look like this:
```
PUT test
{
  "settings": {
    "analysis": {
      "analyzer": {
        "classic": {
          "type": "custom",
          "tokenizer": "classic",
          "filter": [
            "lowercase"
          ]
        },
        "prefix": {
          "type": "custom",
          "tokenizer": "whitespace",
          "filter": [
            "lowercase",
            "asciifolding",
            "prefix"
          ]
        }
      },
      "filter": {
        "prefix": {
          "type": "edge_ngram",
          "min_gram": 1,
          "max_gram": 5
        }
      },
      "normalizer": {
        "lowercase": {
          "filter": [
            "lowercase"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "shopName": {
        "type": "text",
        "index": false
      },
      "product": {
        "properties": {
          "name": {
            "type": "text",
            "fields": {
              "stemmed": {
                "type": "text",
                "analyzer": "english"
              },
              "prefixes": {
                "type": "text",
                "analyzer": "prefix",
                "search_analyzer": "standard"
              },
              "exact": {
                "type": "keyword",
                "normalizer": "lowercase"
              }
            }
          },
          "id": {
            "type": "text",
            "analyzer": "classic"
          },
          "type": {
            "type": "keyword"
          }
        }
      },
      "description": {
        "type": "text"
      }
    }
  }
}
```

And the sample document we want to analyze looks like this:
```
PUT test/_doc/1
{
  "shopName": "Amazon",
  "product": {
    "name": "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included",
    "id": "EB-STATE4-01 4D-1",
    "type": "Smart Home Devices"
  },
  "description": "With built-in Alexa voice service, ecobee4 can listen to your voice commands and respond. Have it set a timer, read you the news, adjust the temperature, and more. It also works well with other Alexa Devices by supporting ESP, so that only the device closest to you responds to your commands. It also comes with a room sensor that helps manage hot or cold spots in your home, delivering comfort in the rooms that matter. And because they can detect occupancy, they can automatically enable the right mode on your ecobee4 for energy savings when it senses no one is home."
}
```

If we run ElastiXray against that document:

`$> node elastixray.js -c localhost:9200 -x test -i 1`

We would get the following output
```
description:
   type            : text
   analyzer        : standard
   sample          : "With built-in Alexa voice service, ecobee4 can listen to your voice commands and respond. Have it set a timer, read you the news, adjust the temperature, and more. It also works well with other Alexa Devices by supporting ESP, so that only the device closest to you responds to your commands. It also comes with a room sensor that helps manage hot or cold spots in your home, delivering comfort in the rooms that matter. And because they can detect occupancy, they can automatically enable the right mode on your ecobee4 for energy savings when it senses no one is home."
   tokens          : ["with","built","in","alexa","voice","service","ecobee4","can","listen","to","your","voice","commands","and","respond","have","it","set","a","timer","read","you","the","news","adjust","the","temperature","and","more","it","also","works","well","with","other","alexa","devices","by","supporting","esp","so","that","only","the","device","closest","to","you","responds","to","your","commands","it","also","comes","with","a","room","sensor","that","helps","manage","hot","or","cold","spots","in","your","home","delivering","comfort","in","the","rooms","that","matter","and","because","they","can","detect","occupancy","they","can","automatically","enable","the","right","mode","on","your","ecobee4","for","energy","savings","when","it","senses","no","one","is","home"]

description:
   type            : text
   search_analyzer : standard
   sample          : "With built-in Alexa voice service, ecobee4 can listen to your voice commands and respond. Have it set a timer, read you the news, adjust the temperature, and more. It also works well with other Alexa Devices by supporting ESP, so that only the device closest to you responds to your commands. It also comes with a room sensor that helps manage hot or cold spots in your home, delivering comfort in the rooms that matter. And because they can detect occupancy, they can automatically enable the right mode on your ecobee4 for energy savings when it senses no one is home."
   tokens          : ["with","built","in","alexa","voice","service","ecobee4","can","listen","to","your","voice","commands","and","respond","have","it","set","a","timer","read","you","the","news","adjust","the","temperature","and","more","it","also","works","well","with","other","alexa","devices","by","supporting","esp","so","that","only","the","device","closest","to","you","responds","to","your","commands","it","also","comes","with","a","room","sensor","that","helps","manage","hot","or","cold","spots","in","your","home","delivering","comfort","in","the","rooms","that","matter","and","because","they","can","detect","occupancy","they","can","automatically","enable","the","right","mode","on","your","ecobee4","for","energy","savings","when","it","senses","no","one","is","home"]

product.id:
   type            : text
   analyzer        : classic
   sample          : "EB-STATE4-01 4D-1"
   tokens          : ["eb-state4-01","4d-1"]

product.id:
   type            : text
   search_analyzer : classic
   sample          : "EB-STATE4-01 4D-1"
   tokens          : ["eb-state4-01","4d-1"]

product.name:
   type            : text
   analyzer        : standard
   sample          : "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included"
   tokens          : ["ecobee4","smart","thermostat","with","built","in","alexa","room","sensor","included"]

product.name:
   type            : text
   search_analyzer : standard
   sample          : "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included"
   tokens          : ["ecobee4","smart","thermostat","with","built","in","alexa","room","sensor","included"]

product.name.exact:
   type            : keyword
   normalizer      : lowercase
   sample          : "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included"
   tokens          : ["ecobee4 smart thermostat with built-in alexa, room sensor included"]

product.name.prefixes:
   type            : text
   analyzer        : prefix
   sample          : "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included"
   tokens          : ["e","ec","eco","ecob","ecobe","s","sm","sma","smar","smart","t","th","the","ther","therm","w","wi","wit","with","b","bu","bui","buil","built","a","al","ale","alex","alexa","r","ro","roo","room","s","se","sen","sens","senso","i","in","inc","incl","inclu"]

product.name.prefixes:
   type            : text
   search_analyzer : standard
   sample          : "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included"
   tokens          : ["ecobee4","smart","thermostat","with","built","in","alexa","room","sensor","included"]

product.name.stemmed:
   type            : text
   analyzer        : english
   sample          : "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included"
   tokens          : ["ecobee4","smart","thermostat","built","alexa","room","sensor","includ"]

product.name.stemmed:
   type            : text
   search_analyzer : english
   sample          : "ecobee4 Smart Thermostat with Built-In Alexa, Room Sensor Included"
   tokens          : ["ecobee4","smart","thermostat","built","alexa","room","sensor","includ"]
```

So, ElastiXray will retrieve each `text`/`keyword` field from the document at any level (object fields, sub-fields, etc) and figure out their `analyzer`, `search_analyzer` or `normalizer` in order to analyze the field's content. It then displays all fields, sub-fields and nested fields with:
 * the analyzer that was used
 * the sample text that was analyzed
 * the tokens that came out of the analysis process

## Setup

Simply install the NPM module

`$> npm install elastixray`

## Usage

```
$> node elastixray.js --help

ElastiXray

  X-Ray tool that shows the details of the Elasticsearch analysis process. 

Options

  -c, --cluster string   The Elasticsearch cluster to connect to                 
  -a, --ca string        The path to the root CA certificate of your cluster                    
  -x, --index string     The index of the document to analyze                    
  -i, --id string        The ID of the document to analyze                       
  -f, --format string    The output format (console, json, yaml)                 
  -h, --help             Usage help                                              
```