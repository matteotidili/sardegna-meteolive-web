/** One cancellable overlay preload, including any preceding projection job. */
export function preloadOverlayImage(
  source: string | Promise<string | null>, signal: AbortSignal, timeoutMs = 20_000,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Overlay cancelled", "AbortError")); return; }
    let image: HTMLImageElement | null = null;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (image) {
        image.onload = image.onerror = null;
        if (error) image.src = "";
      }
      if (error) reject(error);
      else resolve(image!);
    };
    const abort = () => finish(new DOMException("Overlay cancelled", "AbortError"));
    const timer = setTimeout(() => {
      const error = new Error("Overlay image timed out");
      error.name = "TimeoutError";
      finish(error);
    }, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(source).then((url) => {
      if (finished) return;
      if (!url) { finish(new Error("Overlay image unavailable")); return; }
      image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => finish();
      image.onerror = () => finish(new Error("Overlay image unavailable"));
      image.src = url;
    }, (error: unknown) => finish(error instanceof Error ? error : new Error("Overlay projection failed")));
  });
}
