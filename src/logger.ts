export interface LoggerStep {
	error?: Error;
	message: string;
	timeTakenMs: number;
}

export class Logger {
	private step: LoggerStep = {
		message: "Start",
		timeTakenMs: 0
	}
	private data: any = {};
	private start = Date.now();

	constructor(id?: string) {
		this.data.id = id;
	}

	private isDebug(): boolean {
		return process.env.DEBUG ? process.env.DEBUG === "true" : false;
	}

	getId(): string | undefined {
		return this.data.id || undefined;
	}

	info(message: string, data?: any, debug = false) {
		if (debug && !this.isDebug()) { // Don't show debug logs if DEBUG env isn't true, regardless of debug arg
			return;
		}

		const now = Date.now();
		this.step = {
			message,
			timeTakenMs: now - this.start
		};
		this.start = now;
		if (data) {
            this.data = Object.assign(this.data, data);
        }
		this.print(this.getId(), data);
	}

	debug(message: string, data?: any) {
		this.info(message, data, true);
	}

	error(error: Error, data?: any) {
		const now = Date.now();
		this.step = {
			error,
			message: error.message ? error.message : "",
			timeTakenMs: now - this.start
		};
		this.start = now;
		if (data) {
            this.data = Object.assign(this.data, data);
        }
		this.print(this.getId(), this.data);
	}

	exists(key: string): boolean {
		return key in this.data;
	}

	set(key: string, value: unknown) {
		this.data[key] = value;
	}

	get(key: string): unknown | undefined {
		return this.data[key];
	}

	getData(): any {
		return this.data;
	}

	getStep(): LoggerStep {
		return this.step;
	}

	private print(id?: string, data?: any) {
		let prefix = `[${new Date().toISOString()}]`;
		if (id) {
			prefix += `[${id}]`;
		}
		prefix += `[+${this.getStep().timeTakenMs}ms]`;
		
		const step = this.getStep();
		console.log(`${prefix} ${step.message}`);
		if (step.error && step.error.stack) {
			console.log(step.error.stack);
		}

		if (data && Object.keys(data).length > 0) {
			console.log(JSON.stringify(data, null, 4));
		}
	}
}