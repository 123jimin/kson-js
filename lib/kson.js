class KSON {
	constructor(obj) {
		this.data = obj;
	}
	toJSON() {
		return this.data;
	}
}

KSON.VERSION = "test/20190302";

module.exports = KSON;
