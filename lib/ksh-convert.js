const KSON = require("./kson.js");

const CHART_LINE_TYPE = {
	'HEADER': 0,
	'BODY': 1
};

const REGEX = {
	'OPTION': /^([^=]+)=(.+)$/,
	'LINE': /^(\d{4})\|(\d{2})\|([0-9A-Za-o\-:]{2})(?:(@\(|@\)|@<|@>|S<|S>)(\d+))?$/
};

class KSHLine {
	constructor(match, mods) {
		this.bt = match[1];
		this.fx = match[2];
		this.laser = match[3];
		this.rot = match[4] || "";
		this.mods = mods || [];
	}
}

class KSHReader {
	constructor(kshString) {
		this.rawChart = kshString;
		this.parsed = null;
		this.parseKSH();
	}
	parseKSH() {
		let meta = {};
		let measures = [];
		this.parsed = {
			'meta': meta,
			'measures': []
		};
		let chartLines = this.rawChart.split('\n');
		let currType = CHART_LINE_TYPE.HEADER;
		let measureQueue = [];
		let modifiers = [];

		let procMeasure = () => {
			measures.push(measureQueue);
			measureQueue = [];
		};
		chartLines.forEach((line) => {
			line = line.trim();
			if(!line) return;

			let match;
			switch(currType) {
				case CHART_LINE_TYPE.HEADER:
					if(line == "--") {
						currType = CHART_LINE_TYPE.BODY;
						return;
					}
					match = line.match(REGEX.OPTION);
					if(match == null) return;
					meta[match[1]] = match[2];
					break;
				case CHART_LINE_TYPE.BODY:
					if(line == "--") {
						procMeasure();
						return;
					}
					// TODO: handle these later
					if(line[0] == '#') return;
					match = line.match(REGEX.OPTION);
					if(match) {
						modifiers.push([match[1], match[2]]);
						return;
					}
					match = line.match(REGEX.LINE);
					if(match) {
						measureQueue.push(new KSHLine(match, modifiers));
						modifiers = [];
						return;
					}
					break;
			}
		});
		// Non-standard
		if(measureQueue.length) procMeasure();
	}
	toKSON() {
		this.data = {};
		return new KSON(this.data);
	}
}

class KSHWriter {
	constructor() {

	}

}

module.exports = {
	'KSHReader': KSHReader,
	'KSHWriter': KSHWriter,
	'ksh2kson': (kshString) => { return (new KSHReader(kshString)).toKSON(); }
};
