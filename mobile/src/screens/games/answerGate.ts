export interface AnswerGate {
  tryEnter(): boolean;
  release(): void;
}

export function createAnswerGate(): AnswerGate {
  let entered = false;

  return {
    tryEnter() {
      if (entered) {
        return false;
      }

      entered = true;
      return true;
    },
    release() {
      entered = false;
    },
  };
}
