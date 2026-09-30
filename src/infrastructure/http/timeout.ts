export type TimeoutController = {
  signal: AbortSignal;
  cleanup: () => void;
};

export function createTimeoutController(timeoutMs: number): TimeoutController {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
    },
  };
}
