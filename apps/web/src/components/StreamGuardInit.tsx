'use client';

import { useEffect } from 'react';

let streamGuardApplied = false;

function applyWritableStreamGuard() {
  if (streamGuardApplied || typeof window === 'undefined') return;
  if (typeof WritableStreamDefaultWriter === 'undefined') return;
  streamGuardApplied = true;

  const origWrite = WritableStreamDefaultWriter.prototype.write;
  const origClose = WritableStreamDefaultWriter.prototype.close;

  WritableStreamDefaultWriter.prototype.write = function (chunk: unknown) {
    try {
      if (this.desiredSize === null) return Promise.resolve();
      return origWrite.call(this, chunk).catch((err: unknown) => {
        if (err && String((err as Error).message || err).includes('CLOSED writable stream')) {
          return;
        }
        throw err;
      });
    } catch (err: unknown) {
      if (err && String((err as Error).message || err).includes('CLOSED writable stream')) {
        return Promise.resolve();
      }
      return Promise.reject(err);
    }
  };

  WritableStreamDefaultWriter.prototype.close = function () {
    try {
      if (this.desiredSize === null) return Promise.resolve();
      return origClose.call(this).catch((err: unknown) => {
        if (err && String((err as Error).message || err).includes('CLOSED writable stream')) {
          return;
        }
        throw err;
      });
    } catch (err: unknown) {
      if (err && String((err as Error).message || err).includes('CLOSED writable stream')) {
        return Promise.resolve();
      }
      return Promise.reject(err);
    }
  };
}

export function StreamGuardInit() {
  useEffect(() => {
    applyWritableStreamGuard();
  }, []);

  return null;
}
