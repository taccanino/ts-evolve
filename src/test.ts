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

// --- In your business logic ---
const fetchUser = Executable.create(
  async (id: string, scope: string) => {
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
  errorRegistry, // Pass the registry here
  [
    // Before middlewares can modify the input ('as const' is needed for type inference)
    async (id, scope) => [id.trim(), scope.trim()] as const,
  ],
  [
    // After middlewares can modify the output
    async (result) => {
      return { ...result, name: result.name.toUpperCase() };
    },
  ]
);

// --- At the call site ---
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