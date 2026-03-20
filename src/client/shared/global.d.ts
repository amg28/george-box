declare global {
  interface Window {
    io?: (...args: unknown[]) => {
      on: <TArgs extends unknown[] = unknown[]>(event: string, handler: (...eventArgs: TArgs) => void) => void;
      emit: <TResponse = unknown>(event: string, payload?: unknown, ack?: (response: TResponse) => void) => void;
      timeout: (ms: number) => {
        emit: <TResponse = unknown>(
          event: string,
          payload: unknown,
          ack: (error: Error | null, response: TResponse) => void
        ) => void;
      };
      connected: boolean;
    };
  }
}

export {};