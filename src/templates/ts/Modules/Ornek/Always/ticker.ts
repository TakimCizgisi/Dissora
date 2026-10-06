import type { ModuleContext } from "dissora";

/**
 * Periyodik gorev. Varsayilan olarak `modulecontext` alir.
 */
export default function ticker(context: ModuleContext): void {
    context.log.trace("ticker");
}
