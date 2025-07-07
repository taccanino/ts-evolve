// --- Core Result Type ---
type Success<R> = { ok: true; result: R };
type Failure<E> = { ok: false; error: E };
export type Result<R, E> = Success<R> | Failure<E>;

function succeed<R>(result: R): Success<R> {
  return { ok: true, result };
}

function fail<E>(error: E): Failure<E> {
  return { ok: false, error };
}

// --- Defect for unexpected errors ---
export class Defect extends Error {
  public constructor(message?: string | undefined, public inner?: Error | undefined) {
    super(message);
    this.name = 'Defect';
  }
}

// --- A helper type to extract the instance types from a registry of constructors ---
/**
 * Infers a union of error instance types from a record of error constructors.
 * e.g., for { A: typeof ErrorA, B: typeof ErrorB }, it produces ErrorA | ErrorB.
 */
type RegisteredErrors<TErrorRegistry extends Record<string, new (...args: any[]) => Error>> =
  // If the registry is empty, the error type is `never` to prevent the misuse of the raise function.
  keyof TErrorRegistry extends never
  ? never
  // Otherwise, get the instance type of each constructor in the registry.
  : InstanceType<TErrorRegistry[keyof TErrorRegistry]>;

/**
 * A type-safe wrapper for an asynchronous function that can throw specific, registered errors.
 * @template Input The tuple type for the arguments of the wrapped function.
 * @template Output The success type of the wrapped function's promise.
 * @template TErrorRegistry A record mapping string keys to error constructors (e.g., `{ MyError: MyErrorClass }`).
 */
export class Executable<
  Input extends any[],
  Output,
  TErrorRegistry extends Record<string, new (...args: any[]) => Error>
> {
  private constructor(
    private readonly func: (...args: Input) => Promise<Output>, // `| never` is redundant with `Promise`
    private readonly errors: TErrorRegistry,
    private readonly beforeMiddlewares: ((...args: Input) => Promise<Input>)[],
    private readonly afterMiddlewares: ((result: Output) => Promise<Output>)[],
  ) { }

  /**
   * Creates an Executable with a registry of possible errors.
   * Type inference will automatically capture the types from the provided error registry.
   */
  public static create<
    Input extends any[],
    Output,
    const TErrorRegistry extends Record<string, new (...args: any[]) => Error>
  >(
    func: (...args: Input) => Promise<Output>,
    errors?: TErrorRegistry,
    beforeMiddlewares?: ((...args: Input) => Promise<Input>)[],
    afterMiddlewares?: ((result: Output) => Promise<Output>)[]
  ): Executable<Input, Output, TErrorRegistry> {
    return new Executable(func, errors ?? ({} as TErrorRegistry), beforeMiddlewares ?? [], afterMiddlewares ?? []);
  }

  /**
   * Executes the wrapped function and returns a Result object.
   * The error type in the Result is a union of all registered error instances and the `Defect` type.
   * This method handles both success and failure cases, applying middlewares as needed.
   */
  public async execute(...args: Input): Promise<Result<Output, RegisteredErrors<TErrorRegistry> | Defect>> {
    try {
      // Apply before middlewares if any
      if (this.beforeMiddlewares)
        for (const middleware of this.beforeMiddlewares)
          args = await middleware(...args);

      // Call the wrapped function
      let result = await this.func(...args);

      // Apply after middlewares if any
      if (this.afterMiddlewares)
        for (const middleware of this.afterMiddlewares)
          result = await middleware(result);

      return succeed(result);
    } catch (error) {
      // The `error` is `unknown`. We cast it to the expected union type.
      // This is the boundary where we trust that only registered errors (or defects) are thrown.
      return fail(error as RegisteredErrors<TErrorRegistry> | Defect);
    }
  }

  /**
   * Throws a registered error. This should be used inside the wrapped function.
   * @param errorName The key of the error in the registry.
   * @param errorParameters The parameters for the error's constructor.
   */
  public raise<T extends keyof TErrorRegistry>(
    errorName: T,
    ...errorParameters: ConstructorParameters<TErrorRegistry[T]>
  ): never {
    // The runtime check is still good practice.
    if (!(errorName in this.errors)) {
      // This case should not happen if using TypeScript correctly.
      throw new Defect(`Error "${String(errorName)}" is not registered.`);
    }
    const errorConstructor = this.errors[errorName];
    const errorInstance = new errorConstructor(...errorParameters);
    errorInstance.name = errorName as string; // Set the name for better debugging
    throw errorInstance; // Throw the error instance
  }
}