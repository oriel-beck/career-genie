export const BrowserCapability = {
  SecureContext: 'secureContext',
  IndexedDB: 'indexedDB',
  CryptoSubtle: 'cryptoSubtle',
  CryptoRandom: 'cryptoRandom',
  ShowDirectoryPicker: 'showDirectoryPicker',
  FileSystemDirectoryHandle: 'fileSystemDirectoryHandle',
  Blob: 'blob',
  FileReader: 'fileReader',
  CreateObjectURL: 'createObjectURL',
} as const;
export type BrowserCapability =
  (typeof BrowserCapability)[keyof typeof BrowserCapability];

export type BrowserSupportResult = {
  supported: boolean;
  missing: BrowserCapability[];
};

function isLocalhostHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

type BrowserGlobal = typeof globalThis & {
  isSecureContext?: boolean;
  location?: { hostname?: string };
  indexedDB?: IDBFactory;
  crypto?: Crypto;
  showDirectoryPicker?: unknown;
  FileSystemDirectoryHandle?: unknown;
  Blob?: typeof Blob;
  FileReader?: typeof FileReader;
  URL?: typeof URL;
};

export function checkBrowserSupport(
  global: BrowserGlobal = globalThis as BrowserGlobal,
): BrowserSupportResult {
  const missing: BrowserCapability[] = [];
  const secureOk =
    global.isSecureContext === true ||
    (typeof global.location?.hostname === 'string' &&
      isLocalhostHostname(global.location.hostname));
  if (!secureOk) missing.push(BrowserCapability.SecureContext);
  if (!global.indexedDB) missing.push(BrowserCapability.IndexedDB);
  if (!global.crypto?.subtle) missing.push(BrowserCapability.CryptoSubtle);
  if (typeof global.crypto?.getRandomValues !== 'function') {
    missing.push(BrowserCapability.CryptoRandom);
  }
  if (typeof global.showDirectoryPicker !== 'function') {
    missing.push(BrowserCapability.ShowDirectoryPicker);
  }
  if (typeof global.FileSystemDirectoryHandle === 'undefined') {
    missing.push(BrowserCapability.FileSystemDirectoryHandle);
  }
  if (typeof global.Blob === 'undefined') missing.push(BrowserCapability.Blob);
  if (typeof global.FileReader === 'undefined') missing.push(BrowserCapability.FileReader);
  if (typeof global.URL?.createObjectURL !== 'function') {
    missing.push(BrowserCapability.CreateObjectURL);
  }
  return { supported: missing.length === 0, missing };
}
