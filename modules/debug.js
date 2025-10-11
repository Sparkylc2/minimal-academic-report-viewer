const D = false;
export function debugLog(...args) {
  if (D) console.log(...args);
}
