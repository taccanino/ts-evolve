type Success<R> = { ok: true; result: R };
type Failure<E> = { ok: false; error: E };
export type Result<R, E> = Success<R> | Failure<E>;

function succeed<R>(result: R): Success<R> {
  return { ok: true, result };
}

function fail<E extends {}>(error: E): Failure<E> {
  return { ok: false, error };
}

class Defect extends Error {
  public constructor(message?: string | undefined) {
    super(message);
    this.name = 'Defect';
  }
}

export class Executable<Input extends any[], Output, ErrorRegistry extends Record<string, E>, E extends new (...args: EI) => EO, EI extends any[], EO extends {}> {
  private constructor(
    private readonly func: (...args: Input) => Promise<Output> | never,
    public readonly errors: ErrorRegistry = {} as ErrorRegistry,
  ) { }

  public static create<Input extends any[], Output, ErrorRegistry extends Record<string, E>, E extends new (...args: EI) => EO, EI extends any[], EO extends {}>(
    func: (...args: Input) => Promise<Output> | never,
    errors: ErrorRegistry = {} as ErrorRegistry,
  ): Executable<Input, Output, ErrorRegistry, E, EI, EO> {
    return new Executable(func, errors);
  }

  public async execute(...args: Input): Promise<Result<Output, E | Defect>> {
    try {
      const result = await this.func(...args);
      return succeed(result);
    } catch (error) {
      return fail(error as E | Defect);
    }
  }

  public raise<T extends keyof ErrorRegistry>(errorName: T, ...errorParameters: ConstructorParameters<typeof this.errors[T]>): never {
    if (!(errorName in this.errors))
      throw new Error(`Error "${errorName as string}" is not registered.`);
    throw new this.errors[errorName](...errorParameters);
  }
}