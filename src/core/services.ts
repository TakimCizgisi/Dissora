import type { ProjectPaths } from "../services/Paths.js";
import type { TimerRegistry } from "../services/TimerRegistry.js";
import type { Registry } from "./Registry.js";

/** `client.dissora.services` altinda sunulan cerceve servisleri. */
export interface DissoraServices {
    readonly registry: Registry;
    readonly timers: TimerRegistry;
    readonly paths: ProjectPaths;
}

export function createServices(
    registry: Registry,
    timers: TimerRegistry,
    paths: ProjectPaths
): DissoraServices {
    return { registry, timers, paths };
}
