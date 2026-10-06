import { AlwaysLoader } from "./AlwaysLoader.js";
import { CommandLoader } from "./CommandLoader.js";
import { EventLoader } from "./EventLoader.js";
import type { Loader } from "./types.js";

/**
 * Loader sirasi.
 *
 * Yeni bir yukleme tipi eklemek icin: sinifi uret, `LOADERS` dizisine
 * dogru sira ile ekle. Baska hicbir dosyayi degistirmen gerekmez.
 */
export const LOADERS: readonly Loader[] = [
    new CommandLoader(),
    new EventLoader(),
    new AlwaysLoader()
];

export function loaderNames(): string[] {
    return LOADERS.map(loader => loader.name);
}

export { COMMAND_NAME_PATTERN, isValidCommandName } from "./CommandLoader.js";
export * from "./types.js";
export { AlwaysLoader, CommandLoader, EventLoader };
