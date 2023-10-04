const EventEmitter = require('events').EventEmitter;
const emitter = new EventEmitter();
const fs = require('fs');
const _ = require('underscore');
const cla = require('command-line-args');
const clu = require('command-line-usage');
const packageJson = require('./package');

// read input parameters
const sections = [
    {
        header: 'ElastiXray',
        content: packageJson.description
    },
    {
        header: 'Options',
        optionList: [
            {
                name: 'cluster',
                alias: 'c',
                type: String,
                description: 'The Elasticsearch cluster to connect to'
            },
            {
                name: 'ca',
                alias: 'a',
                type: String,
                description: 'The path to the root CA certificate of the cluster'
            },
            {
                name: 'index',
                alias: 'x',
                type: String,
                description: 'The index of the document to analyze'
            },
            {
                name: 'id',
                alias: 'i',
                type: String,
                description: 'The ID of the document to analyze'
            },
            {
                name: 'help',
                alias: 'h',
                type: Boolean,
                description: 'Usage help'
            },

        ]
    }
];
const options = cla(sections[1].optionList);

// check inputs
if (options.help) {
    console.log(clu(sections));
    process.exit();
}
if (!options.cluster) {
    console.log('No ES cluster to connect to. Make sure to specify a host using the -c switch.');
    process.exit();
}
if (!options.index || !options.id) {
    console.log('No ES document to analyze. Make sure to specify a document using the -x and -i switches.');
    process.exit();
}
// assert all good, let's go...

const { Client } = require('@elastic/elasticsearch');
const clientOpts = {
    node: options.cluster
}
if (options.ca) {
    clientOpts.tls = {
        ca: fs.readFileSync(options.ca),
        rejectUnauthorized: false
    }
}
const esClient = new Client(clientOpts);

////////////////////////////////////////////
// 1. retrieve the index settings/mappings
////////////////////////////////////////////
emitter.on('get-mapping', function(params) {
    esClient.indices.getMapping({
        index: params.index,
    }).then(resp => {
        params.obj = resp[params.index].mappings.properties;
        emitter.emit('get-document', params);
    }).catch(error => {
        console.error("Error when retrieving the mapping for index %s: %s", params.index, error);
    });
});

////////////////////////////////////////////
// 2. retrieve the sample document
////////////////////////////////////////////
emitter.on('get-document', function(params) {
    esClient.get({
        index: params.index,
        id: params.id
    }).then(resp => {
        params.sample = resp._source;
        emitter.emit('parse', params);
    }).catch(error => {
        console.error("Error when retrieving document with ID %s: %s", params.id, error);
    });
});

////////////////////////////////////////////
// 3. parse the mappings
////////////////////////////////////////////
emitter.on('parse', function(params) {
    params.fields = {};

    function getValue(containerObj, path) {
        try {
            return _(path).reduce(function(obj, key) {
                return obj[key];
            }, containerObj);
        } catch (e) {
            return null;
        }
    }

    const parseObject = function(ctx, obj, sub) {
        Object.keys(obj).forEach(function(field) {
            const fieldDef = obj[field];

            // inner object
            if (fieldDef.properties) {
                return parseObject(ctx.concat([field]), fieldDef.properties, false);
            }

            const type = fieldDef.type;
            const index = typeof fieldDef.index === 'undefined' && !fieldDef.index;
            const nameParts = ctx.concat([field]);
            const dottedName = nameParts.join('.');

            if (type === 'text' && index) {
                params.fields[dottedName] = {
                    nameParts: nameParts,
                    dottedName: dottedName,
                    type: type,
                    subfield: sub,
                    analyzer: (fieldDef.analyzer || 'standard'),
                    search_analyzer: (fieldDef.search_analyzer || fieldDef.analyzer || 'standard'),
                    sampleValue: getValue(params.sample, sub ? nameParts.slice(0, nameParts.length - 1) : nameParts)
                };
            }
            else if (type === 'keyword' && fieldDef.normalizer && index) {
                params.fields[dottedName] = {
                    nameParts: nameParts,
                    dottedName: dottedName,
                    type: type,
                    subfield: sub,
                    normalizer: fieldDef.normalizer,
                    sampleValue: getValue(params.sample, sub ? nameParts.slice(0, nameParts.length - 1) : nameParts)
                };
            }

            // sub-fields
            if (fieldDef.fields) {
                return parseObject(ctx.concat([field]), fieldDef.fields, true);
            }
        });
    };
    parseObject(params.ctx, params.obj, false);

    emitter.emit('pre-analyze', params);
});

////////////////////////////////////////////
// 4. figure out all the fields to analyze
////////////////////////////////////////////
emitter.on('pre-analyze', function(params) {
    params.pipeline = [];

    ['analyzer', 'search_analyzer', 'normalizer'].forEach(function(type) {
        Object.values(params.fields).filter(f => f[type] !== null && typeof f[type] !== 'undefined').forEach(function(f) {
            if (params.fields[f.dottedName] && params.fields[f.dottedName].sampleValue) {
                params.pipeline.push({
                    name: f.dottedName,
                    realType: type,
                    type: type.replace('search_', ''),
                    analyzer: f[type],
                    value: f.sampleValue
                });
            }
        });
    });
    emitter.emit('analyze', params);
});

////////////////////////////////////////////
// 5. perform the analysis on sample data
////////////////////////////////////////////
emitter.on('analyze', function(params) {

    if (params.pipeline.length === 0) {
        emitter.emit('results', params);
        return;
    }

    const next = params.pipeline.pop();
    // Check if the field contains a sample value, otherwise just add a dummy one
    if (!next.value || next.value.length === 0) {
        next.value = "Lorem ipsum dolor sit amet";
    }

    const body = {
        text: next.value
    };
    body[next.type] = next.analyzer;

    esClient.indices.analyze({
        index: params.index,
        body: body
    }).then(resp => {
        if (resp.tokens.length) {
            params.fields[next.name][next.realType + 'Tokens'] = resp.tokens.map(it => it.token);
        }
        emitter.emit('analyze', params);
    }).catch(error => {
        console.log(JSON.stringify(error))
        console.error("Error when analyzing document with ID %s: %s", params.id, error);
    });
});

////////////////////////////////////////////
// 6. show results
////////////////////////////////////////////
emitter.on('results', function(params) {

    Object.keys(params.fields).sort().forEach(function(key) {
        var field = params.fields[key];
        if (field.sampleValue) {
            if (field.analyzer) {
                console.log(key + ':');
                console.log('   type            : ' + field.type);
                console.log('   analyzer        : ' + field.analyzer);
                console.log('   sample          : ' + JSON.stringify(field.sampleValue));
                console.log('   tokens          : ' + JSON.stringify(field.analyzerTokens));
                console.log('');
            }
            if (field.search_analyzer) {
                console.log(key + ':');
                console.log('   type            : ' + field.type);
                console.log('   search_analyzer : ' + field.search_analyzer);
                console.log('   sample          : ' + JSON.stringify(field.sampleValue));
                console.log('   tokens          : ' + JSON.stringify(field.search_analyzerTokens));
                console.log('');
            }
            if (field.normalizer) {
                console.log(key + ':');
                console.log('   type            : ' + field.type);
                console.log('   normalizer      : ' + field.normalizer);
                console.log('   sample          : ' + JSON.stringify(field.sampleValue));
                console.log('   tokens          : ' + JSON.stringify(field.normalizerTokens));
                console.log('');
            }
        }
    });
});

////////////////////////////////////////////
// 0. kick off the process
////////////////////////////////////////////
emitter.emit('get-mapping', {
    index: options.index,
    id: options.id,
    ctx: []
});
