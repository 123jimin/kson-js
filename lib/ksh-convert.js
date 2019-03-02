const KSON = require("./kson.js");

const KSH_DEFAULT_MEASURE_TICK = 192;

const CHART_LINE_TYPE = {
	'HEADER': 0,
	'BODY': 1
};

const REGEX = {
	'OPTION': /^([^=]+)=(.+)$/,
	'LINE': /^([012]{4})\|(.{2})\|([0-9A-Za-o\-:]{2})(?:(@\(|@\)|@<|@>|S<|S>)(\d+))?$/
};

class KSHLine {
	constructor(match, mods) {
		this.bt = match[1];
		this.fx = match[2];
		this.laser = match[3];
		this.rot = match[4] || "";
		this.mods = mods || [];
		this.tick = 0;
		this.len = 0;
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
			'measures': measures,
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
			line = line.replace(/^[\r\n\uFEFF]+|[\r\n]+$/g, '');
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
	getDifficulty() {
		switch((this.parsed.meta.difficulty || "").trim().toLowerCase()) {
			case 'light': return 0;
			case 'challenge': return 1;
			case 'extended': return 2;
			case 'infinite': return 3;
		}
		return 3;
	}
	getKSONMeta() {
		let meta = {};
		meta.title = this.parsed.meta.title || "";
		meta.artist = this.parsed.meta.artist || "";
		meta.level = ((level) => isNaN(level) ? 1 : level < 1 ? 1 : level > 20 ? 20 : level)(parseInt(this.parsed.meta.level || 1));

		let difficulty = {'idx': this.getDifficulty()};
		if('difficulty' in this.parsed.meta) difficulty.name = this.parsed.meta.difficulty;
		meta.difficulty = difficulty;

		if('t' in this.parsed.meta) meta.disp_bpm = this.parsed.meta.t;

		// TODO: illustrator and jacket
		// TODO: standard tempo
		// TODO: offset value
		// TODO: other missing meta values

		return meta;
	}
	toKSON() {
		if(this.parsed == null) return null;
		// TODO: version format
		const version = this.parsed.meta.ver.trim() ? `ksh ${this.parsed.meta.ver.trim()}` : "ksh";
		let kson = {'version': version, 'meta': this.getKSONMeta()};

		let beatInfo = {'bpm': [], 'time_sig': [], 'scroll_speed': [], 'resolution': KSH_DEFAULT_MEASURE_TICK / 4};
		let noteInfo = {'button': [[], [], [], [], [], []], 'laser': [[], []]};
		kson.beat = beatInfo;
		kson.note = noteInfo;

		// TODO: handle `t` and `beat` in the header
		const measures = this.parsed.measures;
		(function procBeat() {
			let measure_tick = 0;
			let time_sig = [4, 4];

			measures.forEach((measure, measure_idx) => {
				if(measure.length == 0) throw new Error("Malformed ksh measure!");
				measure[0].mods.forEach(([key, value]) => {
					switch(key) {
						case 'beat':
							time_sig = value.split('/').map((x) => parseInt(x));
							if(time_sig.length != 2 || time_sig.some((x) => isNaN(x) || x < 1))
								throw new Error("Invalid ksh time signature! [invalid value]");
							if(KSH_DEFAULT_MEASURE_TICK % time_sig[1] != 0)
								throw new Error("Invalid ksh time signature! [invalid denom]");
							beatInfo.time_sig.push({'idx': measure_idx, 'v': {'n': time_sig[0], 'd': time_sig[1]}});
							break;
					}
				});
				const measure_len = (KSH_DEFAULT_MEASURE_TICK / time_sig[1]) * time_sig[0];
				if(measure_len % measure.length != 0)
					throw new Erorr("Invalid ksh measure line count!");
				const tick_per_line = measure_len / measure.length;
				measure.forEach((kshLine, line_idx) => {
					let tick = kshLine.tick = measure_tick + tick_per_line * line_idx;
					kshLine.len = tick_per_line;

					kshLine.mods.forEach(([key, value]) => {
						const intValue = parseInt(value);
						const floatValue = parseFloat(value);
						switch(key) {
							case 'beat':
								if(line_idx > 0) throw new Error("Invalid ksh time signature! [invalid location]");
								break;
							case 't':
								if(floatValue <= 0 || isNaN(floatValue)) throw new Error("Invalid ksh BPM value!");
								beatInfo.bpm.push({'y': tick, 'v': floatValue});
								break;
							case 'stop':
								if(intValue <= 0 || isNaN(intValue)) throw new Error("Invalid ksh stop length!");
								// TODO: add ScrollSpeedPoints
								break;
						}
					});
				});
				measure_tick += measure_len;
			});
		})();
		(function procNotes() {
			let longInfo = [null, null, null, null, null, null];

			let cutLongNote = (lane) => {
				if(longInfo[lane] == null) return;

				noteInfo.button[lane].push({'y': longInfo[lane][0], 'v': {'l': longInfo[lane][1]}});
				longInfo[lane] = null;
			};

			let addLongInfo = (lane, y, l) => {
				if(longInfo[lane] == null) longInfo[lane] = [y, 0];
				if(longInfo[lane][0] + longInfo[lane][1] != y) {
					// Something went wrong
				}
				longInfo[lane][1] += l;
			};

			measures.forEach((measure) => {
				measure.forEach((kshLine) => {
					// BT
					for(let i=0; i<4; i++) {
						const c = kshLine.bt[i];
						if(c == '0' || c == '1') cutLongNote(i);
						if(c == '0') continue;
						if(c == '1') {
							noteInfo.button[i].push({'y': kshLine.tick, 'v': {'l': 0}});
							continue;
						}
						addLongInfo(i, kshLine.tick, kshLine.len);
					}
					// FX
					for(let i=0; i<2; i++) {
						const c = kshLine.fx[i];
						if(c == '0' || c == '2') cutLongNote(4+i);
						if(c == '0') continue;
						if(c == '2') {
							noteInfo.button[4+i].push({'y': kshLine.tick, 'v': {'l': 0}});
							continue;
						}
						addLongInfo(4+i, kshLine.tick, kshLine.len);
					}
				});
			});
			for(let i=0; i<6; i++) cutLongNote(i);
		})();

		console.dir(kson, {'depth': null, 'colors': true});
		return new KSON(kson);
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
