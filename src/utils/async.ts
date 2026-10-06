/**
 * Async sonuc yardimcilari.
 *
 * `result instanceof Promise` kontrolu yalnizca native promise'leri yakalar:
 * `then` metodu olan bir thenable, baska bir realm'den gelen promise veya
 * `async` olmayan bir fonksiyonun dondurdugu promise-benzeri deger sessizce
 * gecerdi ve framework `unhandledRejection` guard'i ile sureci oldururdu.
 */

/** Degerin promise-benzeri olup olmadigini kontrol eder. */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as PromiseLike<unknown>).then === "function"
    );
}

/**
 * Bir handler'in dondurdugu degeri guvenle izler.
 *
 * Hem senkron `throw` hem de reddedilmis (veya reddedilecek) promise
 * `onError` bildirimine aktarilir. Donus degeri bilerek yutulur: Discord
 * `EventEmitter` sonucu kullanmaz, kullanici da handler'dan deger
 * beklemez.
 */
export function traceHandlerResult(
    invoke: () => unknown,
    onError: (error: unknown) => void
): void {
    let result: unknown;

    try {
        result = invoke();
    } catch (error) {
        onError(error);

        return;
    }

    if (!isPromiseLike(result)) {
        return;
    }

    // `Promise.resolve` hem native promise'i hem thenable'i tek yola indirger.
    Promise.resolve(result).catch(onError);
}
