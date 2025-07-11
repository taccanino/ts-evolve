import { Executable } from "./lib/Executable";

class UserNotFoundError extends Error {
  constructor(public userId: string) { super(`User ${userId} not found.`); }
}
class PermissionDeniedError extends Error {
  constructor(public operation: string) { super(`Permission denied for ${operation}.`); }
}

const errorRegistry = {
  UserNotFoundError,
  PermissionDeniedError,
};

abstract class ILogger {
  abstract log(message: string): void;
}

class ConsoleLogger extends ILogger {
  log(message: string): void {
    console.log(message);
  }
}

abstract class ISerializable {
  abstract serialize(): string;
}

class Dog extends ISerializable {
  constructor(public name: string) { super(); }
  serialize(): string {
    return JSON.stringify({ type: 'Dog', name: this.name });
  }
}

const dependencyRegistry = {
  ILogger: new ConsoleLogger(),
  ISerializable: Dog,
};

const fetchUser = Executable.createFunctional(
  ({ raise, get }) => async (args: { id: string, scope: string }) => {
    const logger = get("ILogger");

    const dogConstructor = get("ISerializable");
    const dog = new dogConstructor('Fido');

    logger.log(dog.serialize());

    if (args.id === 'bad-id')
      raise('UserNotFoundError', args.id);

    if (args.scope !== 'admin')
      raise('PermissionDeniedError', 'fetchUser');

    return { name: 'Alice', id: args.id };
  },
  {
    beforeMiddlewares: (/*{ raise, get }*/) => [async (args) => [args]],
    afterMiddlewares: (/*{ raise, get }*/) => [async (result) => ({ ...result, name: result.name.toUpperCase() })],
    errors: errorRegistry,
    dependencies: dependencyRegistry,
  }
);

(async () => {
  const result = await fetchUser({ id: 'bad-id', scope: 'user' });

  if (result.ok)
    console.log(result.result.name);
  else {
    const error = result.error;
    console.error(error.message);

    if (error instanceof UserNotFoundError)
      console.log(error.userId);
  }
})();