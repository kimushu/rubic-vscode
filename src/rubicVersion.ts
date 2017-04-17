import * as path from 'path';

/**
 * Stores version string of Rubic itself
 */
export const RUBIC_VERSION: string = (() => {
    return require(path.join(__dirname, "..", "..", "package.json")).version;
})();
