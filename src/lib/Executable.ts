type Success<R> = { ok: true; result: R };
type Failure<E> = { ok: false; error: E };
export type Result<R, E> = Success<R> | Failure<E>;

function succeed<R>(result: R): Success<R> {
  return { ok: true, result };
}

function fail<E>(error: E): Failure<E> {
  return { ok: false, error };
}

export class Defect extends Error {
  public constructor(message?: string, public inner?: Error) {
    super(message);
    this.name = 'Defect';
  }
}

/** A record of error constructors. */
type ErrorRegistry = undefined | Record<string, new (...args: any[]) => Error>;

/** A record of dependency instances. */
type DependencyRegistry = undefined | Record<string, object>;

/** Infers a union of error instance types from a record of error constructors. */
type RegisteredErrors<TErrorRegistry extends ErrorRegistry> =
  TErrorRegistry extends undefined
  ? never
  : InstanceType<Exclude<TErrorRegistry, undefined>[keyof TErrorRegistry]>;

/** The context object provided to the main function and middlewares. */
export type ExecutionContext<
  TErrorRegistry extends ErrorRegistry,
  TDepRegistry extends DependencyRegistry
> = {
  raise: <T extends keyof TErrorRegistry>(
    errorName: T,
    ...errorParameters: ConstructorParameters<Exclude<TErrorRegistry, undefined>[T]>
  ) => never;
  get: <T extends keyof TDepRegistry>(dependencyName: T) => TDepRegistry[T];
};

type FuncFactory<
  Input extends any[],
  Output,
  TErrorRegistry extends ErrorRegistry,
  TDepRegistry extends DependencyRegistry
> = (context: ExecutionContext<TErrorRegistry, TDepRegistry>) => (...args: Input) => Promise<Output>;

/** A middleware function that runs before the main function. */
type BeforeMiddleware<Input extends any[]> = (...args: Input) => Promise<Input>;

/** A middleware function that runs after the main function. */
type AfterMiddleware<Output> = (result: Output) => Promise<Output>;

/** A factory function that returns an array of before-middlewares. */
type BeforeMiddlewareFactory<
  Input extends any[],
  TErrorRegistry extends ErrorRegistry,
  TDepRegistry extends DependencyRegistry
> = (context: ExecutionContext<TErrorRegistry, TDepRegistry>) => BeforeMiddleware<Input>[];

/** A factory function that returns an array of after-middlewares. */
type AfterMiddlewareFactory<
  Output,
  TErrorRegistry extends ErrorRegistry,
  TDepRegistry extends DependencyRegistry
> = (context: ExecutionContext<TErrorRegistry, TDepRegistry>) => AfterMiddleware<Output>[];

/** Configuration options for creating an Executable. */
export type ExecutableOptions<
  Input extends any[],
  Output,
  TErrorRegistry extends ErrorRegistry,
  TDepRegistry extends DependencyRegistry
> = {
  errors?: TErrorRegistry;
  dependencies?: TDepRegistry;
  beforeMiddlewares?: BeforeMiddlewareFactory<Input, TErrorRegistry, TDepRegistry>;
  afterMiddlewares?: AfterMiddlewareFactory<Output, TErrorRegistry, TDepRegistry>;
};

export class Executable<
  const Input extends any[],
  Output,
  const TErrorRegistry extends ErrorRegistry,
  const TDepRegistry extends DependencyRegistry
> {
  private readonly funcFactory: FuncFactory<Input, Output, TErrorRegistry, TDepRegistry>;
  private readonly options: Required<ExecutableOptions<Input, Output, TErrorRegistry, TDepRegistry>>;

  private constructor(
    funcFactory: FuncFactory<Input, Output, TErrorRegistry, TDepRegistry>,
    options?: ExecutableOptions<Input, Output, TErrorRegistry, TDepRegistry>
  ) {
    this.funcFactory = funcFactory;
    // Centralize the handling of default options
    this.options = {
      errors: options?.errors as TErrorRegistry,
      dependencies: options?.dependencies as TDepRegistry,
      beforeMiddlewares: options?.beforeMiddlewares ?? (() => []),
      afterMiddlewares: options?.afterMiddlewares ?? (() => []),
    };
  }

  public static create<
    const Input extends any[],
    Output,
    const TErrorRegistry extends ErrorRegistry,
    const TDepRegistry extends DependencyRegistry
  >(
    funcFactory: FuncFactory<Input, Output, TErrorRegistry, TDepRegistry>,
    options?: ExecutableOptions<Input, Output, TErrorRegistry, TDepRegistry>
  ) {
    return new Executable(funcFactory, options);
  }

  public static createFunctional<
    const Input extends any[],
    Output,
    const TErrorRegistry extends ErrorRegistry,
    const TDepRegistry extends DependencyRegistry
  >(
    funcFactory: FuncFactory<Input, Output, TErrorRegistry, TDepRegistry>,
    options?: ExecutableOptions<Input, Output, TErrorRegistry, TDepRegistry>
  ) {
    const executable = new Executable(funcFactory, options);
    return executable.execute.bind(executable);
  }

  public async execute(...args: Input): Promise<Result<Output, RegisteredErrors<TErrorRegistry> | Defect>> {
    const context: ExecutionContext<TErrorRegistry, TDepRegistry> = {
      raise: this.raise.bind(this),
      get: this.get.bind(this),
    };

    try {
      // Apply before middlewares
      let currentArgs = args;
      for (const middleware of this.options.beforeMiddlewares(context))
        currentArgs = await middleware(...currentArgs);

      // Execute the main function
      let result = await this.funcFactory(context)(...currentArgs);

      // Apply after middlewares
      for (const middleware of this.options.afterMiddlewares(context))
        result = await middleware(result);

      return succeed(result);
    } catch (error) {
      // Boundary where we know that only registered errors (or defects) are thrown.
      return fail(error as RegisteredErrors<TErrorRegistry> | Defect);
    }
  }

  private raise<T extends keyof TErrorRegistry>(
    errorName: T,
    ...errorParameters: ConstructorParameters<Exclude<TErrorRegistry, undefined>[T]>
  ): never {
    if (!this.options.errors || !(errorName in this.options.errors))
      throw new Defect(`Error "${String(errorName)}" is not registered.`);

    const errorConstructor = (this.options.errors as Exclude<TErrorRegistry, undefined>)[errorName];
    const errorInstance = new errorConstructor(...errorParameters);
    errorInstance.name = errorName as string;
    throw errorInstance;
  }

  private get<T extends keyof TDepRegistry>(dependencyName: T): TDepRegistry[T] {
    if (!this.options.dependencies)
      throw new Defect(`Dependency "${String(dependencyName)}" is not registered.`);
    const dependencyInstance = (this.options.dependencies as Exclude<TDepRegistry, undefined>)[dependencyName];
    if (dependencyInstance === undefined)
      throw new Defect(`Dependency "${String(dependencyName)}" is not registered.`);

    return dependencyInstance;
  }
}