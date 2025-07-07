import { Defect, Executable } from "./lib/Executable";

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
);

(async () => {
  const result = await main.execute(1, 2);
  if (result.ok)
    return console.log("Success:", result.result);

  if (result.error instanceof SpecialError)
    return console.log("SpecialError:", result.error);

  if (result.error instanceof SpecialError2)
    return console.log("SpecialError2:", result.error);

  if (result.error instanceof Defect)
    return console.log("Defect:", result.error);

  return console.log("Unexpected error:", result.error);
})();