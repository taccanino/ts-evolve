# ts-evolve

![npm version](https://img.shields.io/npm/v/ts-evolve)
![build status](https://img.shields.io/github/actions/workflow/status/your-username/ts-evolve/your-workflow-file.yml)
![license](https://img.shields.io/npm/l/ts-evolve)

A simple typescript library for building robust, observable functions with a focus on typesafe error handling and dependency injection.

## Installation

Install the package using npm:

```bash
npm install ts-evolve
```

## Example usage

```typescript
import { Executable } from "ts-evolve";

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
```

## API

Import the Executable class and create the executable with the `create` or `createFunctional` static methods.
The only difference with the two methods is the way you will call the executable.

With `create` you will obtain the reference to the newly created Executable object, so to execute it you must call `await executable.execute(...)`.

With `createFunctional` you will instead obtain the direct reference to the execute function, so to execute it you just call it `await executable(...)`.

The result of the execution is always a `Promise` that resolves to a `Result` object like `{ ok: true, result: ... } | { ok: false, error: ... }`.

When inside the executable function you must use the provided function `raise` to throw errors in a typesafe way.
Similarly you can use the provided function `get` to extract the injected dependencies in a typesafe way.