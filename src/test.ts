import { Executable } from "./lib/Executable";

class SpecialError extends Error {
  constructor(message?: string | undefined) {
    super(message);
  }
}

class SpecialError2 extends Error {
  constructor(message: number) {
    super(message.toString());
  }
}

const main = Executable.create(
  async (a: number, b: number) => {
    main.raise('SpecialError2', 2);
    return a + b;
  },
  {
    SpecialError,
    SpecialError2,
  }
)

main.execute(1, 2).then(data => { console.log(data) });