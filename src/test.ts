import { Executable } from "./lib/Executable";

// Define some errors with different constructors
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

// Define a dependency registry
const dependencyRegistry = {
  ILogger: new ConsoleLogger(),
  ISerializable: Dog,
};

// --- In your business logic ---
const fetchUser = Executable.create(
  async (id: string, scope: string) => {
    const logger = fetchUser.get("ILogger");

    const dogConstructor = fetchUser.get("ISerializable");
    const dog = new dogConstructor('Fido');

    logger.log(dog.serialize());

    if (id === 'bad-id') {
      // `errorName` is inferred as "UserNotFoundError" | "PermissionDeniedError"
      // `errorParameters` are correctly inferred for each different type of constructor
      fetchUser.raise('UserNotFoundError', id);
    }
    if (scope !== 'admin') {
      fetchUser.raise('PermissionDeniedError', 'fetchUser');
    }
    return { name: 'Alice', id };
  },
  {
    errors: errorRegistry,
    dependencies: dependencyRegistry,
    beforeMiddlewares: [
      // Before middlewares can modify the input
      async (id, scope) => [id.trim(), scope.trim()],
    ],
    afterMiddlewares: [
      // After middlewares can modify the output
      async (result) => {
        return { ...result, name: result.name.toUpperCase() };
      },
    ]
  }
);

(async () => {
  const result = await fetchUser.execute('bad-id', 'user');

  if (result.ok) {
    // `result.result` is correctly typed as { name: string, id: string }
    console.log(result.result.name);
  } else {
    // `result.error` is correctly typed as:
    // UserNotFoundError | PermissionDeniedError | Defect
    const error = result.error;
    console.error(error.message);

    // You can even narrow the error type
    if (error instanceof UserNotFoundError) {
      console.log(error.userId); // This is type-safe!
    }
  }
})();