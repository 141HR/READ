type WithResolvers = <T>() => {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const promiseTarget = Promise as unknown as { withResolvers?: WithResolvers };

if (typeof promiseTarget.withResolvers !== 'function') {
  // Android WebView 113 / 部分旧内核没有 Promise.withResolvers，PDF.js 6 会直接报错
  promiseTarget.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

type TransferableBuffer = ArrayBuffer & {
  transfer?: (newByteLength?: number) => ArrayBuffer;
  transferToFixedLength?: (newByteLength?: number) => ArrayBuffer;
};

const bufferPrototype = ArrayBuffer.prototype as TransferableBuffer;

function copyBuffer(source: ArrayBuffer, newByteLength?: number): ArrayBuffer {
  const size = newByteLength === undefined ? source.byteLength : Math.max(0, newByteLength);
  const target = new ArrayBuffer(size);
  new Uint8Array(target).set(new Uint8Array(source).subarray(0, Math.min(size, source.byteLength)));
  return target;
}

if (typeof bufferPrototype.transferToFixedLength !== 'function') {
  // PDF.js 6 在 worker 里用这个 API 转移 TypedArray；旧 WebView 113 没有
  Object.defineProperty(bufferPrototype, 'transferToFixedLength', {
    value: function transferToFixedLength(this: ArrayBuffer, newByteLength?: number) {
      return copyBuffer(this, newByteLength);
    },
    writable: true,
    configurable: true,
  });
}

if (typeof bufferPrototype.transfer !== 'function') {
  Object.defineProperty(bufferPrototype, 'transfer', {
    value: function transfer(this: ArrayBuffer, newByteLength?: number) {
      return copyBuffer(this, newByteLength);
    },
    writable: true,
    configurable: true,
  });
}

export {};
