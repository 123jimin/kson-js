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
console.log(argv);
