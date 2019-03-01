#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const yargs = require('yargs');
const kson = require("../");

const argv = (yargs
	.usage("Usage: $0 [options] <filename>")
	.help('h').alias('h', 'help')
	.describe('f', "Input file format (default: guess from filename)").choices('f', ['ksh', 'kson']).alias('f', 'from')
	.describe('t', "Output file format (default: opposite of the input)").choices('t', ['ksh', 'kson']).alias('t', 'to')
	.describe('o', "Output file name").string('o').alias('o', 'out')
	.demandCommand(1)
).argv;

const in_filename = argv._[0];
const in_format = 'from' in argv ? argv['from'] : ((ext) => {
	if(ext == 'ksh' || ext == 'kson') return ext;
	throw new Error("Unknown input file format!");
})(path.extname(in_filename).slice(1).toLowerCase());

const out_format = 'to' in argv ? argv['to'] : in_format == 'ksh' ? 'kson' : 'ksh';
const out_filename = 'out' in argv ? argv['out'] : in_filename.slice(0, -path.extname(in_filename).length) + '.' + out_format;

const in_text = fs.readFileSync(in_filename, 'utf-8');

let in_kson = null;

switch(in_format) {
	case 'ksh':
		in_kson = kson.ksh2kson(in_text);
		break;
	case 'kson':
		break;
}

if(in_kson == null) throw new Error("Something went wrong during reading the file.");
