class PDFQueue {
  constructor({ concurrency = 2, maxQueued = 20 } = {}) {
    this.concurrency = concurrency;
    this.maxQueued = maxQueued;
    this.active = 0;
    this.pending = [];
  }

  enqueue(jobFn) {
    return new Promise((resolve, reject) => {
      if (this.pending.length >= this.maxQueued) {
        return reject(new Error('Queue full'));
      }

      this.pending.push({ jobFn, resolve, reject });
      this._process();
    });
  }

  _process() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const { jobFn, resolve, reject } = this.pending.shift();
      this.active++;

      Promise.resolve()
        .then(() => jobFn())
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.active--;
          this._process();
        });
    }
  }

  getStatus() {
    return {
      active: this.active,
      pending: this.pending.length,
      concurrency: this.concurrency,
      maxQueued: this.maxQueued,
    };
  }
}

module.exports = new PDFQueue();
