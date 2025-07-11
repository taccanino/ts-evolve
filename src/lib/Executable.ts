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

/** * The Executable class wraps a function and provides a structured way to handle errors, dependencies, and
  * middlewares. It allows you to define a function that can raise specific errors and access dependencies in a type-safe manner.
  * It also supports before and after middlewares for input and output transformations.
  */
export class Executable<
  const Input extends any[],
  Output,
  const TErrorRegistry extends Record<string, new (...args: any[]) => Error>,
  const TDepRegistry extends Record<string, object>
> {
  private constructor(
    private readonly func: (...args: Input) => Promise<Output>, // `| never` is redundant with `Promise`
    private readonly options: {
      errors: TErrorRegistry,
      dependencies: TDepRegistry,
      beforeMiddlewares: ((...args: Input) => Promise<Input>)[],
      afterMiddlewares: ((result: Output) => Promise<Output>)[],
    }
  ) { }
  /**
   * Creates a new Executable instance.
   * @param func The function to wrap.
   * @param errors A record of error constructors that can be raised by the wrapped function.
   * @param dependencies A record of dependencies that can be injected into the wrapped function.
   * @param beforeMiddlewares An array of middlewares to apply before the function execution.
   * @param afterMiddlewares An array of middlewares to apply after the function execution.
   */
  public static create<
    const Input extends any[],
    Output,
    const TErrorRegistry extends Record<string, new (...args: any[]) => Error>,
    const TDepRegistry extends Record<string, object>
  >(
    func: (...args: Input) => Promise<Output>,
    options?: {
      errors?: TErrorRegistry,
      dependencies?: TDepRegistry,
      beforeMiddlewares?: ((...args: Input) => Promise<Input>)[],
      afterMiddlewares?: ((result: Output) => Promise<Output>)[]
    }
  ): Executable<Input, Output, TErrorRegistry, TDepRegistry> {
    const realOptions = {
      errors: options?.errors ?? {} as TErrorRegistry,
      dependencies: options?.dependencies ?? {} as TDepRegistry,
      beforeMiddlewares: options?.beforeMiddlewares ?? [] as ((...args: Input) => Promise<Input>)[],
      afterMiddlewares: options?.afterMiddlewares ?? [] as ((result: Output) => Promise<Output>)[]
    };
    return new Executable(func, realOptions);
  }

  /**
   * Executes the wrapped function and returns a Result object.
   * The error type in the Result is a union of all registered error instances and the `Defect` type.
   * This method handles both success and failure cases, applying middlewares as needed.
   */
  public async execute(...args: Input): Promise<Result<Output, RegisteredErrors<TErrorRegistry> | Defect>> {
    try {
      // Apply before middlewares if any
      if (this.options.beforeMiddlewares)
        for (const middleware of this.options.beforeMiddlewares)
          args = await middleware(...args);

      // Call the wrapped function
      let result = await this.func(...args);

      // Apply after middlewares if any
      if (this.options.afterMiddlewares)
        for (const middleware of this.options.afterMiddlewares)
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
    if (!(errorName in this.options.errors)) {
      // This case should not happen if using TypeScript correctly.
      throw new Defect(`Error "${String(errorName)}" is not registered.`);
    }
    const errorConstructor = this.options.errors[errorName];
    const errorInstance = new errorConstructor(...errorParameters);
    errorInstance.name = errorName as string; // Set the name for better debugging
    throw errorInstance; // Throw the error instance
  }

  /**
   * Retrieves a dependency instance from the registry. This should be used inside the wrapped function.
   * It is typesafe and will return the specific type of the dependency instance.
   * @param dependencyName The key of the dependency in the registry.
   */
  public get<T extends keyof TDepRegistry>(dependencyName: T): TDepRegistry[T] {
    const dependencyInstance = this.options.dependencies[dependencyName];
    if (dependencyInstance === undefined) {
      // This is a programming error (a defect), as the type system should prevent this.
      throw new Defect(`Dependency "${String(dependencyName)}" is not registered.`);
    }
    return dependencyInstance;
  }
}