class KSON {
	constructor(obj) {
		this.data = obj;
	}
	toJSON() {
		return this.data;
	}
}

module.exports = KSON;