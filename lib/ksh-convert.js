const KSON = require("./kson.js");

const KSH_DEFAULT_MEASURE_TICK = 192;
const KSH_LASER_SLAM_TICK = KSH_DEFAULT_MEASURE_TICK / 32;
const KSH_LASER_VALUES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno";

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

class KSHTimeSig {
	constructor(str) {
		const timeSig = this.timeSig = str.split('/').map((x) => parseInt(x));
		if(timeSig.length != 2 || timeSig.some((x) => !isFinite(x) || x < 1))
			throw new Error("Invalid ksh time signature! [invalid value]");
		if(KSH_DEFAULT_MEASURE_TICK % timeSig[1] != 0)
			throw new Error("Invalid ksh time signature! [invalid denom]");
	}
	toKSON() {
		return {'n': this.timeSig[0], 'd': this.timeSig[1]};
	}
}

class KSHGraph {
	constructor(isRelative, options) {
		this.isRelative = isRelative;
		if(isRelative) {
			this.collapseTick = options.collapseTick || 0;
			this.range = options.range || 1;
			this.iy = options.y || 0;
		}
		// Array of relative y values
		this.ys = [];
		// Array of values
		this.vs = [];
		// Arrays of final values
		this.vfs = [];
	}
	push(y, v) {
		let lastInd = this.ys.length - 1;
		if(y < this.ys[lastInd]) throw new Error("Invalid insertion order in KSHGraph!");
		if(y <= this.ys[lastInd] + this.collapseTick) {
			this.vfs[lastInd] = v;
		} else {
			this.ys.push(y);
			this.vs.push(v);
			this.vfs.push(v);
		}
	}
	toKSON() {
		let segments = [];
		// TODO: simplify using curves
		for(let i=0; i<this.ys.length; i++) {
			let segment = {'v': this.vs[i]};
			segment[this.isRelative ? 'ry' : 'y'] = this.ys[i] - this.iy;
			if(this.vfs[i] != this.vs[i]) segment.vf = this.vfs[i];

			segments.push(segment);
		}
		return segments;
	}
}

class KSHReader {
	constructor(kshString, config) {
		this.rawChart = kshString;
		this.config = config || {};
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
		meta.chart_author = this.parsed.meta.effect || "";
		meta.level = ((level) => !isFinite(level) ? 1 : level < 1 ? 1 : level > 20 ? 20 : level)(parseInt(this.parsed.meta.level || 1));

		let difficulty = {'idx': this.getDifficulty()};
		if('difficulty' in this.parsed.meta) difficulty.name = this.parsed.meta.difficulty;
		meta.difficulty = difficulty;

		if('t' in this.parsed.meta) meta.disp_bpm = this.parsed.meta.t;
		if('to' in this.parsed.meta) {
			meta.std_bpm = parseFloat(this.parsed.meta.to);
			if(!isFinite(meta.std_bpm)) throw new Error("Invalid ksh `to` value!");
		}
		if('jacket' in this.parsed.meta) meta.jacket_filename = this.parsed.meta.jacket;
		if('illustrator' in this.parsed.meta) meta.jacket_author = this.parsed.meta.illustrator;
		if('information' in this.parsed.meta) meta.information = this.parsed.meta.information;

		return meta;
	}
	getKSONBgmInfo() {
		let bgmInfo = {};
		if('m' in this.parsed.meta) {
			const m = this.parsed.meta.m.split(';')[0].trim();
			if(m) bgmInfo.filename = m;
		}
		if('mvol' in this.parsed.meta) {
			const mvol = parseInt(this.parsed.meta.mvol);
			if(isFinite(mvol) && mvol != 100) bgmInfo.vol = mvol;
		}
		if('o' in this.parsed.meta) {
			const offset = parseInt(this.parsed.meta.o);
			if(isFinite(offset) && offset != 0) bgmInfo.offset = offset;
		}
		if('po' in this.parsed.meta) {
			const preview_offset = parseInt(this.parsed.meta.po);
			if(isFinite(preview_offset) && preview_offset >= 0) bgmInfo.preview_offset = preview_offset;
		}
		if('plength' in this.parsed.meta) {
			const preview_duration = parseInt(this.parsed.meta.plength);
			if(isFinite(preview_duration) && preview_duration >= 0) bgmInfo.preview_duration = preview_duration;
		}
		return bgmInfo;
	}
	toKSON() {
		if(this.parsed == null) return null;
		// TODO: version format
		const version = this.parsed.meta.ver.trim() ? `ksh ${this.parsed.meta.ver.trim()}` : "ksh";
		let kson = {'version': version, 'meta': this.getKSONMeta()};

		if('total' in this.parsed.meta) {
			let total = parseInt(this.parsed.meta.total);
			if(!isFinite(total)) throw new Error("Invalid ksh `total` value!");
			if(total < 100) total = 100;
			kson.gauge = {'total': total};
		}

		let beatInfo = {'bpm': [], 'time_sig': [], 'scroll_speed': [], 'resolution': KSH_DEFAULT_MEASURE_TICK / 4};
		let noteInfo = {'button': [[], [], [], [], [], []], 'laser': [[], []]};

		let audioInfo = {'bgm': this.getKSONBgmInfo(), 'key_sound': {}, 'audio_effect': {}};
		let cameraInfo = {};

		kson.beat = beatInfo;
		kson.note = noteInfo;
		kson.audio = audioInfo;
		kson.camera = cameraInfo;

		// TODO: handle `t` and `beat` in the header
		if('t' in this.parsed.meta) {
			const initBPM = parseFloat(this.parsed.meta.t);
			if(initBPM <= 0 || !isFinite(initBPM)) throw new Error("Invalid ksh init BPM!");
			beatInfo.bpm.push({'y': 0, 'v': initBPM});
		}
		if('beat' in this.parsed.meta) {
			beatInfo.time_sig.push({'idx': 0, 'v': (new KSHTimeSig(this.parsed.meta.beat)).toKSON()});
		}
		const measures = this.parsed.measures;
		// Processing timing and calculating tick values
		(function procBeat() {
			let measure_tick = 0;
			let time_sig = [4, 4];

			measures.forEach((measure, measure_idx) => {
				if(measure.length == 0) throw new Error("Malformed ksh measure!");
				measure[0].mods.forEach(([key, value]) => {
					switch(key) {
						case 'beat':
							const newTimeSig = new KSHTimeSig(value);
							time_sig = newTimeSig.timeSig;
							beatInfo.time_sig.push({'idx': measure_idx, 'v': newTimeSig.toKSON()});
							break;
					}
				});
				const measure_len = (KSH_DEFAULT_MEASURE_TICK / time_sig[1]) * time_sig[0];
				if(measure_len % measure.length != 0)
					throw new Error("Invalid ksh measure line count!");
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
								if(floatValue <= 0 || !isFinite(floatValue)) throw new Error("Invalid ksh BPM value!");
								beatInfo.bpm.push({'y': tick, 'v': floatValue});
								break;
							case 'stop':
								if(intValue <= 0 || !isFinite(intValue)) throw new Error("Invalid ksh stop length!");
								// TODO: add ScrollSpeedPoints
								break;
						}
					});
				});
				measure_tick += measure_len;
			});
		})();
		// Converting BT, FX, and lasers
		(function procNotes() {
			let longInfo = [null, null, null, null, null, null];
			let laserSegments = [null, null];
			let laserRange = [1, 1];

			let cutLongNote = (lane) => {
				if(longInfo[lane] == null) return;
				noteInfo.button[lane].push({'y': longInfo[lane][0], 'v': {'l': longInfo[lane][1]}});
				longInfo[lane] = null;
			}, addLongInfo = (lane, y, l) => {
				if(longInfo[lane] == null) longInfo[lane] = [y, 0];
				if(longInfo[lane][0] + longInfo[lane][1] != y) {
					// Something went wrong
				}
				longInfo[lane][1] += l;
			};

			let cutLaserSegment = (lane) => {
				if(laserSegments[lane] == null) return;
				let laser = {'y': laserSegments[lane].iy, 'v': laserSegments[lane].toKSON()};
				if(laserSegments[lane].range != 1) laser.wide = laserSegments[lane].range;
				noteInfo.laser[lane].push(laser);
				laserSegments[lane] = null;
			}, addLaserSegment = (lane, y, v) => {
				if(laserSegments[lane] == null)
					laserSegments[lane] = new KSHGraph(true, {'y': y, 'range': laserRange[lane], 'collapseTick': KSH_LASER_SLAM_TICK});
				laserSegments[lane].push(y, v);
			};

			measures.forEach((measure) => {
				measure.forEach((kshLine) => {
					kshLine.mods.forEach(([key, value]) => {
						switch(key) {
							case 'laserrange_l':
								laserRange[0] = value == "2x" ? 2 : 1;
								break;
							case 'laserrange_r':
								laserRange[1] = value == "2x" ? 2 : 1;
								break;
						}
					});
					// BT
					for(let i=0; i<4; i++) {
						const c = kshLine.bt[i];
						if(c == '0' || c == '1') cutLongNote(i);
						if(c == '0') continue;
						if(c == '1') {
							noteInfo.button[i].push({'y': kshLine.tick});
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
							noteInfo.button[4+i].push({'y': kshLine.tick});
							continue;
						}
						addLongInfo(4+i, kshLine.tick, kshLine.len);
					}
					// Laser
					for(let i=0; i<2; i++) {
						const c = kshLine.laser[i];
						if(c == '-') {
							cutLaserSegment(i);
							continue;
						}
						if(c == ':') continue;

						const pos = KSH_LASER_VALUES.indexOf(c);
						if(pos == -1) throw new Error("Invalid ksh laser pos value!"); // This should never happen

						addLaserSegment(i, kshLine.tick, pos);
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
