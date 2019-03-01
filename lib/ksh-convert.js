const KSON = require("./kson.js");

const CHART_LINE_TYPE = {
	'HEADER': 0,
	'BODY': 1
};

const REGEX = {
	'OPTION': /^([^=]+)=(.+)$/,
	'LINE': /^(\d{4})\|(\d{2})\|([0-9A-Za-o\-:]{2})(?:(@\(|@\)|@<|@>|S<|S>)(\d+))?$/
};

class KSHReader {
	constructor(kshString) {
		this.rawChart = kshString;
		this.parsed = null;
		this.parseKSH();
	}
	parseKSH() {
		let meta = {};
		this.parsed = {
			'meta': meta
		};
		let chartLines = this.rawChart.split('\n');
		let currType = CHART_LINE_TYPE.HEADER;
		chartLines.forEach((line) => {
			line = line.trim();
			if(!line) return;

			switch(currType) {
				case CHART_LINE_TYPE.HEADER:
					if(line == "--") {
						currType = CHART_LINE_TYPE.BODY;
						return;
					}
					let match = line.match(REGEX.OPTION);
					if(match == null) return;
					meta[match[1]] = match[2];
					break;
				case CHART_LINE_TYPE.BODY:

					break;
			}
		});

		console.log(this.parsed.meta);
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
